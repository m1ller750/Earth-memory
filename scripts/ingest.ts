/**
 * Builds src/lib/db/seed/imported.json from the manifest in src/lib/ingest/manifest.ts:
 * every article is parsed with Jina Reader (through Jina's MCP server) and combined with Wikipedia
 * and Wikidata facts. Responses are cached in data/ingest/cache, so re-runs only fetch what is new.
 *
 *   npm run ingest                      build the full dataset
 *   npm run ingest -- --only=natural    preview a subset (dimension or type) in data/ingest/preview.json
 *   npm run ingest -- --refresh         ignore the cache
 *
 * JINA_API_KEY (optional, e.g. in .env.local) raises Jina's rate limits.
 * Load the result into an existing database with `npm run db:import`.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const only = option("only");
  const refresh = args.includes("--refresh");
  const concurrency = Number(option("concurrency") ?? 3);

  const { buildDataset } = await import("../src/lib/ingest/build");
  const { MANIFEST } = await import("../src/lib/ingest/manifest");
  const { RECORDS } = await import("../src/lib/db/seed/records");
  const { LANGUAGES } = await import("../src/lib/db/seed/languages");
  const { SPECIES, ECOSYSTEMS } = await import("../src/lib/db/seed/living-earth");
  const { ENTITIES } = await import("../src/lib/db/seed/graph");

  const manifest = only ? MANIFEST.filter((i) => i.type === only || (i.type === "record" && i.dimension === only)) : MANIFEST;
  if (manifest.length === 0) throw new Error(`Nothing in the manifest matches --only=${only}`);
  const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), "data"));
  const started = Date.now();

  const { dataset, report } = await buildDataset(manifest, {
    cacheDir: path.join(dataDir, "ingest", "cache"),
    refresh,
    concurrency,
    log: (m) => console.info(m),
    existing: {
      recordSlugs: new Set(RECORDS.map((r) => r.slug)),
      languageSlugs: new Set(LANGUAGES.map((l) => l.slug)),
      speciesSlugs: new Set(SPECIES.map((s) => s.slug)),
      ecosystemSlugs: new Set(ECOSYSTEMS.map((e) => e.slug)),
      entities: ENTITIES,
    },
  });

  const target = only ? path.join(dataDir, "ingest", "preview.json") : path.join(process.cwd(), "src", "lib", "db", "seed", "imported.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(dataset, null, 2)}\n`);
  fs.writeFileSync(path.join(dataDir, "ingest", "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const byDimension = dataset.records.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.dimension]: (acc[r.dimension] ?? 0) + 1 }), {});
  console.info(`\nWrote ${path.relative(process.cwd(), target)} in ${Math.round((Date.now() - started) / 1000)} s`);
  console.info(`  records:    ${dataset.records.length}  ${JSON.stringify(byDimension)}`);
  console.info(`  languages:  ${dataset.languages.length}`);
  console.info(`  species:    ${dataset.species.length}`);
  console.info(`  ecosystems: ${dataset.ecosystems.length} (${dataset.ecosystems.reduce((n, e) => n + e.observations.length, 0)} dated observations)`);
  console.info(`  entities:   ${dataset.entities.length}`);
  console.info(`  Jina Reader: ${report.jina.read} articles parsed, ${report.jina.failed} failed (${report.jina.authenticated ? "API key" : "no API key"})`);
  if (report.skipped.length) {
    console.info(`\nSkipped ${report.skipped.length}:`);
    for (const s of report.skipped) console.info(`  - ${s.wiki}: ${s.reason}`);
  }
  if (report.warnings.length) {
    console.info(`\n${report.warnings.length} warnings (full list in data/ingest/report.json):`);
    for (const w of report.warnings.slice(0, 25)) console.info(`  - ${w}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
