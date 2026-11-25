/**
 * Builds public/geo/countries-110m.json: the Natural Earth 1:110m country shapes from
 * `world-atlas` (public domain data, ISC-licensed package) with ISO alpha-2 codes added,
 * so the globe works offline with no third-party map service.
 * Usage: npx tsx scripts/build-geo.ts
 */
import fs from "node:fs";
import path from "node:path";
import { numericToAlpha2 } from "../src/lib/geo/countries";

const source = path.join(process.cwd(), "node_modules", "world-atlas", "countries-110m.json");
const target = path.join(process.cwd(), "public", "geo", "countries-110m.json");

type Geometry = { id?: string; properties?: Record<string, unknown> };
const topology = JSON.parse(fs.readFileSync(source, "utf8")) as { objects: { countries: { geometries: Geometry[] }; land?: unknown } };

let missing = 0;
for (const g of topology.objects.countries.geometries) {
  const code = g.id ? numericToAlpha2(g.id) : undefined;
  if (!code) missing++;
  g.properties = { code: code ?? null, name: g.properties?.name ?? null };
}
delete topology.objects.land;

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(topology));
console.info(`Wrote ${target} (${topology.objects.countries.geometries.length} countries, ${missing} without an ISO code).`);
