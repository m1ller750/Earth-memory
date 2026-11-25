/**
 * Applies migrations and seeds reference data if the archive is empty.
 * Usage: npm run db:seed  (stop the dev server first when using the embedded database)
 */
import { closeDb, getDb } from "../src/lib/db/client";
import { isSeeded, seedDatabase } from "../src/lib/db/seed";

async function main() {
  const db = await getDb({ autoSeed: false });
  if (await isSeeded(db)) {
    console.info("The database already contains reference data. Use `npm run db:reset` to start over.");
  } else {
    await seedDatabase(db, { log: console.info });
  }
  await closeDb();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDb();
  process.exit(1);
});
