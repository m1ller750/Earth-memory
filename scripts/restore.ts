/**
 * Restores a backup made by db:backup. Usage: npm run db:restore -- backups/<timestamp> --yes
 * Replaces data/pglite and data/uploads. Stop the server first.
 */
import fs from "node:fs";
import path from "node:path";
import { dataDir, embeddedDbHolder } from "../src/lib/db/client";

const source = process.argv.find((a, i) => i > 1 && !a.startsWith("--"));
if (!source || !process.argv.includes("--yes")) {
  console.error("Usage: npm run db:restore -- <backup folder> --yes   (this replaces the current data)");
  process.exit(1);
}
const holder = embeddedDbHolder();
if (holder) {
  console.error(`The embedded database is in use by process ${holder}. Stop the server first.`);
  process.exit(1);
}
fs.rmSync(path.join(dataDir(), "pglite.lock"), { force: true });
for (const part of ["pglite", "uploads"]) {
  const src = path.resolve(source, part);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(dataDir(), part);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}
console.info(`Restored from ${path.resolve(source)}`);
