/**
 * Prints a health report of the database: row counts, sample engine proposals and search checks.
 * Usage: npm run db:inspect  (stop the dev server first when using the embedded database)
 */
import { sql } from "drizzle-orm";
import { closeDb, executeRows, getDb, getDbDriver } from "../src/lib/db/client";

async function main() {
  const db = await getDb({ autoSeed: false });
  console.info(`Driver: ${await getDbDriver()}`);

  const counts = await executeRows<{ t: string; n: number }>(
    db,
    sql`
    select 'records' as t, count(*)::int as n from records union all
    select 'languages', count(*)::int from languages union all
    select 'species', count(*)::int from species union all
    select 'ecosystems', count(*)::int from ecosystems union all
    select 'entities', count(*)::int from entities union all
    select 'edges (editorial)', count(*)::int from edges where provenance = 'editorial' union all
    select 'edges (engine, proposed)', count(*)::int from edges where provenance = 'engine' and status = 'proposed' union all
    select 'users', count(*)::int from users union all
    select 'media', count(*)::int from media union all
    select 'reviews', count(*)::int from reviews`,
  );
  for (const row of counts) console.info(`  ${row.t.padEnd(26)} ${row.n}`);

  const proposals = await executeRows<{ a: string; b: string; confidence: number; uncertainty: string; evidence: Array<{ detail: string }> }>(
    db,
    sql`
    select a.title as a, b.title as b, e.confidence, e.uncertainty, e.evidence
    from edges e
    join records a on a.id::text = e.source_id
    join records b on b.id::text = e.target_id
    where e.provenance = 'engine'
    order by e.confidence desc
    limit 8`,
  );
  console.info("\nStrongest engine proposals:");
  for (const r of proposals) {
    console.info(`  ${r.confidence.toFixed(2)} ${r.uncertainty.padEnd(11)} ${r.a}  <->  ${r.b}`);
    console.info(`       ${r.evidence.map((x) => x.detail).join(" · ")}`);
  }

  console.info("\nSearch checks:");
  for (const q of ["silk road", "Самарканд", "olelo hawaii", "aral"]) {
    const res = await executeRows<{ title: string }>(
      db,
      sql`
      select title from records
      where to_tsvector('simple', search_text) @@ websearch_to_tsquery('simple', ${q})
      order by ts_rank(to_tsvector('simple', search_text), websearch_to_tsquery('simple', ${q})) desc
      limit 4`,
    );
    console.info(`  full-text "${q}": ${res.map((r) => r.title).join(" | ") || "(no match)"}`);
  }
  const fuzzy = await executeRows<{ title: string }>(db, sql`select title from records where word_similarity(${"Samarqand"}, title) > 0.4 limit 3`);
  console.info(`  fuzzy "Samarqand": ${fuzzy.map((r) => r.title).join(" | ") || "(no match)"}`);
  await closeDb();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDb();
  process.exit(1);
});
