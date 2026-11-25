/**
 * Deletes ALL data and reseeds the reference dataset. Uploaded files are left on disk.
 * Usage: npm run db:reset -- --yes
 */
import { closeDb, getDb } from "../src/lib/db/client";
import { clearDatabase, seedDatabase } from "../src/lib/db/seed";

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("This deletes every record, account and contribution. Re-run with --yes to confirm: npm run db:reset -- --yes");
    process.exit(1);
  }
  const db = await getDb({ autoSeed: false });
  await clearDatabase(db);
  await seedDatabase(db, { log: console.info });
  await closeDb();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDb();
  process.exit(1);
});
