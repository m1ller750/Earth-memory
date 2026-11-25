/**
 * Adds the imported reference dataset (src/lib/db/seed/imported.json) to an existing database.
 * Only new items are inserted; nothing is deleted or overwritten.
 * Usage: npm run db:import  (stop the dev server first when using the embedded database)
 */
import { closeDb, getDb } from "../src/lib/db/client";
import { applyImages, importDataset } from "../src/lib/db/seed/import-dataset";
import { IMAGES, IMPORTED } from "../src/lib/db/seed/imported";

async function main() {
  if (!IMPORTED.generatedAt) {
    console.info("imported.json is still the placeholder. Run `npm run ingest` first.");
    return;
  }
  const db = await getDb({ autoSeed: false });
  // --refresh-text also updates the summary and body of records this importer created earlier.
  await importDataset(db, IMPORTED, { log: console.info, refreshImportedText: process.argv.includes("--refresh-text") });
  // Photos (npm run images): fills empty photo fields; --refresh-images replaces existing ones.
  const photos = await applyImages(db, IMAGES, { overwrite: process.argv.includes("--refresh-images") });
  console.info(`Set ${photos} photos on records, species and ecosystems.`);
  await closeDb();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDb();
  process.exit(1);
});
