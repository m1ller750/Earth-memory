/**
 * Adds the imported reference dataset (src/lib/db/seed/imported.json) to an existing database.
 * Only new items are inserted; nothing is deleted or overwritten.
 * Usage: npm run db:import  (stop the dev server first when using the embedded database)
 */
import { closeDb, getDb } from "../src/lib/db/client";
import { importDataset } from "../src/lib/db/seed/import-dataset";
import { IMPORTED } from "../src/lib/db/seed/imported";

async function main() {
  if (!IMPORTED.generatedAt) {
    console.info("imported.json is still the placeholder. Run `npm run ingest` first.");
    return;
  }
  const db = await getDb({ autoSeed: false });
  await importDataset(db, IMPORTED, { log: console.info });
  await closeDb();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDb();
  process.exit(1);
});
