import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { visibleRecordsWhere, type Viewer } from "@/lib/access/policy";
import { closeDb, executeRows, getDb, type Database } from "@/lib/db/client";
import { records } from "@/lib/db/schema";
import { seedDatabase } from "@/lib/db/seed";
import { importDataset } from "@/lib/db/seed/import-dataset";
import { IMPORTED } from "@/lib/db/seed/imported";

/** Integration tests on a throwaway in-memory PostgreSQL (PGlite) with real migrations and seed. */
let db: Database;

beforeAll(async () => {
  db = await getDb({ pgliteDir: "memory://", autoSeed: false });
  await seedDatabase(db);
});
afterAll(async () => closeDb());

describe("seeded database", () => {
  it("contains the reference dataset and engine proposals", async () => {
    const [c] = await executeRows<{ records: number; proposals: number }>(db, sql`select (select count(*)::int from records) as records, (select count(*)::int from edges where provenance = 'engine') as proposals`);
    expect(c.records).toBeGreaterThan(50);
    expect(c.proposals).toBeGreaterThan(10);
  });

  it("every record cites at least one source except fictional demos", async () => {
    const rows = await executeRows<{ slug: string }>(db, sql`select slug from records r where origin <> 'demo' and not exists (select 1 from sources s where s.subject_type = 'record' and s.subject_id = r.id)`);
    expect(rows).toEqual([]);
  });

  it("the visibility SQL hides community-only records from anonymous users and agents", async () => {
    const anon = await db.select({ slug: records.slug }).from(records).where(visibleRecordsWhere(null));
    expect(anon.some((r) => r.slug === "demo-community-seasonal-gathering")).toBe(false);
    const [community] = await executeRows<{ id: string }>(db, sql`select id from communities limit 1`);
    const member: Viewer = { id: "00000000-0000-0000-0000-000000000000", name: "m", email: "m", role: "contributor", isDemo: false, communities: [{ id: community.id, role: "member" }] };
    const visible = await db.select({ slug: records.slug }).from(records).where(visibleRecordsWhere(member));
    expect(visible.some((r) => r.slug === "demo-community-seasonal-gathering")).toBe(true);
    const agent = await db.select({ slug: records.slug }).from(records).where(visibleRecordsWhere({ ...member, apiKeyScopes: ["read"] }));
    expect(agent.some((r) => r.slug === "demo-community-seasonal-gathering")).toBe(false);
  });

  it("loads the imported dataset once: a second import adds nothing", async () => {
    const [c] = await executeRows<{ natural: number }>(db, sql`select count(*)::int as natural from records where dimension = 'natural'`);
    expect(c.natural).toBe(IMPORTED.records.filter((r) => r.dimension === "natural").length);
    const again = await importDataset(db, IMPORTED);
    expect(again).toEqual({ records: 0, languages: 0, species: 0, ecosystems: 0, entities: 0, proposals: 0 });
  });

  it("imported records carry the Wikipedia licence and attribution", async () => {
    const rows = await executeRows<{ slug: string }>(
      db,
      sql`select slug from records where attribution like 'Text from the Wikipedia article%' and (license <> 'CC-BY-SA-4.0' or not exists (select 1 from sources s where s.subject_id = records.id and s.url like 'https://en.wikipedia.org/%'))`,
    );
    expect(rows).toEqual([]);
  });

  it("full-text search matches Russian aliases and folded diacritics", async () => {
    const ru = await executeRows<{ slug: string }>(db, sql`select slug from records where to_tsvector('simple', search_text) @@ to_tsquery('simple', 'самарканд:*')`);
    expect(ru.map((r) => r.slug)).toContain("samarkand-crossroad-of-cultures");
    const folded = await executeRows<{ slug: string }>(db, sql`select slug from languages where to_tsvector('simple', search_text) @@ to_tsquery('simple', 'olelo:*')`);
    expect(folded.map((r) => r.slug)).toContain("hawaiian");
  });
});
