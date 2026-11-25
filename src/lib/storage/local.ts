import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../db/client";

/**
 * Local object storage under DATA_DIR/uploads. Keys are random; original file names are
 * never used as paths. A production deployment can swap this module for an
 * S3-compatible implementation with the same three functions.
 */
export function uploadsDir(): string {
  return path.join(dataDir(), "uploads");
}

function resolveKey(key: string): string {
  if (!/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(key)) throw new Error("Invalid storage key");
  const full = path.resolve(uploadsDir(), key);
  if (!full.startsWith(path.resolve(uploadsDir()) + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function saveObject(bytes: Uint8Array, ext: string): Promise<string> {
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
  const full = resolveKey(key);
  await fs.promises.mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });
  await fs.promises.writeFile(/*turbopackIgnore: true*/ full, bytes, { flag: "wx" });
  return key;
}

export function objectStat(key: string): fs.Stats | null {
  try {
    return fs.statSync(/*turbopackIgnore: true*/ resolveKey(key));
  } catch {
    return null;
  }
}

export function readObject(key: string, range?: { start: number; end: number }): fs.ReadStream {
  return fs.createReadStream(/*turbopackIgnore: true*/ resolveKey(key), range);
}
