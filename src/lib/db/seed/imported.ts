import type { RemoteImage } from "../schema";
import images from "./images.json";
import data from "./imported.json";
import type { ImportedDataset } from "./types";

/** Reference data built by `npm run ingest` (Wikipedia via Jina Reader, plus Wikidata). */
export const IMPORTED = data as unknown as ImportedDataset;

/** Freely licensed photos by "record:slug" / "species:slug" / "ecosystem:slug", built by `npm run images`. */
export const IMAGES = images as unknown as Record<string, RemoteImage>;
