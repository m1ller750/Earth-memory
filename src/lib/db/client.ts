import fs from "node:fs";
import path from "node:path";
import { sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Database access.
 *
 * - With DATABASE_URL set, Earth Memory connects to PostgreSQL through node-postgres.
 * - Without it, an embedded PGlite instance (PostgreSQL compiled to WebAssembly) is
 *   persisted under DATA_DIR/pglite. PGlite allows one process per data directory, so a
 *   lock file refuses a second process instead of risking corruption.
 *
 * Connection is lazy: nothing touches the database until the first query, which keeps
 * `next build` and module imports free of database access.
 */

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type DbDriver = "postgres" | "pglite";

interface DbHandle {
  db: Database;
  driver: DbDriver;
  close: () => Promise<void>;
}

export interface InitOptions {
  /** Seed reference data automatically when the archive is empty (default: AUTO_SEED env, true). */
  autoSeed?: boolean;
  /** Override the PGlite location; "memory://" creates a throwaway in-memory database. */
  pgliteDir?: string;
}

const globalForDb = globalThis as unknown as { __earthMemoryDb?: Promise<DbHandle> };

export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), "data"));
}

export function migrationsDir(): string {
  return path.resolve(process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle"));
}

/** Runs a raw SQL query and returns its rows (both drivers expose `rows`). */
export async function executeRows<T>(db: Database, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows: T[] };
  return result.rows;
}

export function getDb(options: InitOptions = {}): Promise<Database> {
  if (!globalForDb.__earthMemoryDb) {
    globalForDb.__earthMemoryDb = initialize(options).catch((error) => {
      globalForDb.__earthMemoryDb = undefined;
      throw error;
    });
  }
  return globalForDb.__earthMemoryDb.then((h) => h.db);
}

export async function getDbDriver(): Promise<DbDriver> {
  await getDb();
  return (await globalForDb.__earthMemoryDb!).driver;
}

export async function closeDb(): Promise<void> {
  const pending = globalForDb.__earthMemoryDb;
  globalForDb.__earthMemoryDb = undefined;
  if (pending) {
    const handle = await pending.catch(() => null);
    await handle?.close();
  }
}

async function initialize(options: InitOptions): Promise<DbHandle> {
  const handle = process.env.DATABASE_URL ? await connectPostgres(process.env.DATABASE_URL) : await connectPglite(options.pgliteDir);
  await prepare(handle.db);
  const autoSeed = options.autoSeed ?? process.env.AUTO_SEED !== "false";
  if (autoSeed) {
    const [{ count }] = await executeRows<{ count: number }>(handle.db, sql`select count(*)::int as count from records`);
    if (count === 0) {
      const { seedDatabase } = await import("./seed");
      await seedDatabase(handle.db, { log: (m) => console.info(`[earth-memory] ${m}`) });
    }
  }
  return handle;
}

async function connectPostgres(url: string): Promise<DbHandle> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_SIZE ?? 10) });
  const db = drizzle(pool, { schema }) as unknown as Database;
  return { db, driver: "postgres", close: () => pool.end() };
}

async function connectPglite(dirOverride?: string): Promise<DbHandle> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const { drizzle } = await import("drizzle-orm/pglite");

  const location = dirOverride ?? process.env.PGLITE_DIR ?? path.join(dataDir(), "pglite");
  const inMemory = location.startsWith("memory://");
  let releaseLock = () => {};
  if (!inMemory) {
    fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(location), { recursive: true });
    releaseLock = acquireLock(`${location}.lock`);
  }

  const client = inMemory ? new PGlite({ extensions: { pg_trgm } }) : new PGlite(location, { extensions: { pg_trgm } });
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as Database;
  return {
    db,
    driver: "pglite",
    close: async () => {
      await client.close();
      releaseLock();
    },
  };
}

/** Creates required extensions and applies pending migrations. */
async function prepare(db: Database) {
  await db.execute(sql`create extension if not exists pg_trgm`);
  const folder = migrationsDir();
  if (!fs.existsSync(/*turbopackIgnore: true*/ folder)) throw new Error(`Migrations folder not found: ${folder}`);
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db as never, { migrationsFolder: folder });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder: folder });
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Pid of a live process holding the embedded database lock, or null (stale locks are ignored). */
export function embeddedDbHolder(): number | null {
  const lockPath = path.join(dataDir(), "pglite.lock");
  try {
    const holder = Number(fs.readFileSync(lockPath, "utf8").trim());
    return holder && holder !== process.pid && isProcessAlive(holder) ? holder : null;
  } catch {
    return null;
  }
}

/** One process per PGlite directory. Stale locks from crashed processes are replaced. */
function acquireLock(lockPath: string): () => void {
  const write = () => fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
  try {
    write();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const holder = Number(fs.readFileSync(lockPath, "utf8").trim());
    if (holder && holder !== process.pid && isProcessAlive(holder)) {
      throw new Error(
        `The embedded database is in use by another process (pid ${holder}). Stop that process (for example a running dev server) or set DATABASE_URL to use PostgreSQL.`,
      );
    }
    fs.rmSync(lockPath, { force: true });
    write();
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      if (fs.readFileSync(lockPath, "utf8").trim() === String(process.pid)) fs.rmSync(lockPath, { force: true });
    } catch {
      /* already gone */
    }
  };
  process.once("exit", release);
  return release;
}
