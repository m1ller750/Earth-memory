import fs from "node:fs";
import path from "node:path";
import { geoCentroid } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { numericToAlpha2 } from "./countries";

/* Approximate centroids for countries whose geometry includes distant territories. */
const CENTROID_OVERRIDES: Record<string, [number, number]> = {
  FR: [46.6, 2.4],
  US: [39.8, -98.6],
  RU: [61.5, 99.0],
  NO: [64.5, 12.0],
  NL: [52.2, 5.3],
  NZ: [-41.0, 174.0],
  FJ: [-17.8, 178.0],
  KI: [1.9, -157.4],
  CL: [-35.7, -71.5],
  DK: [56.0, 10.0],
  GB: [54.0, -2.5],
  ES: [40.2, -3.6],
  PT: [39.6, -8.0],
  EC: [-1.6, -78.5],
  IM: [54.23, -4.55],
  RE: [-21.1, 55.5],
  AQ: [-80.0, 0.0],
};

let cached: Map<string, [number, number]> | null = null;

/** [lat, lng] centroid of every country in the bundled world-atlas geometry. */
export function loadCountryCentroids(): Map<string, [number, number]> {
  if (cached) return cached;
  const file = path.join(process.cwd(), "node_modules", "world-atlas", "countries-50m.json");
  const topology = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as Topology;
  const collection = feature(topology, topology.objects.countries) as unknown as GeoJSON.FeatureCollection;
  const centroids = new Map<string, [number, number]>();
  for (const f of collection.features) {
    if (f.id == null) continue;
    const code = numericToAlpha2(String(f.id));
    if (!code) continue;
    const [lng, lat] = geoCentroid(f);
    centroids.set(code, [lat, lng]);
  }
  for (const [code, value] of Object.entries(CENTROID_OVERRIDES)) centroids.set(code, value);
  cached = centroids;
  return centroids;
}
