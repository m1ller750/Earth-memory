/**
 * Copies the embedded database and uploads into backups/<timestamp>/ (stop the server first).
 * For PostgreSQL use pg_dump instead (see docs/DEPLOYMENT.md).
 */
import fs from "node:fs";
import path from "node:path";
import { dataDir, embeddedDbHolder } from "../src/lib/db/client";

if (process.env.DATABASE_URL) {
  console.error("DATABASE_URL is set: use pg_dump for PostgreSQL backups (docs/DEPLOYMENT.md).");
  process.exit(1);
}
const holder = embeddedDbHolder();
if (holder) {
  console.error(`The embedded database is in use by process ${holder}. Stop the server first.`);
  process.exit(1);
}
const target = path.join(process.cwd(), "backups", new Date().toISOString().replace(/[:.]/g, "-"));
for (const part of ["pglite", "uploads"]) {
  const src = path.join(dataDir(), part);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(target, part), { recursive: true });
}
console.info(`Backup written to ${target}`);
