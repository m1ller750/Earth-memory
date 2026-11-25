import data from "./imported.json";
import type { ImportedDataset } from "./types";

/** Reference data built by `npm run ingest` (Wikipedia via Jina Reader, plus Wikidata). */
export const IMPORTED = data as unknown as ImportedDataset;
