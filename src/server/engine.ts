import { and, eq, inArray, or } from "drizzle-orm";
import { aiSafeRecordsWhere, type Viewer, visibleRecordsWhere } from "@/lib/access/policy";
import { getDb } from "@/lib/db/client";
import { ecosystems, edges, entities, languages, recordEntities, records, species } from "@/lib/db/schema";
import { buildEngineContext, rankRelated, type EngineRecord, type ScoredConnection } from "@/lib/engine/connections";

/** Loads engine inputs for every record the viewer may see (or only AI-safe ones). */
export async function loadEngineRecords(viewer: Viewer | null, scope: "viewer" | "ai-safe" = "viewer") {
  const db = await getDb();
  const rows = await db
    .select({
      id: records.id,
      slug: records.slug,
      title: records.title,
      dimension: records.dimension,
      countryCode: records.countryCode,
      countryCodes: records.countryCodes,
      lat: records.lat,
      lng: records.lng,
      periodStart: records.periodStart,
      periodEnd: records.periodEnd,
      tags: records.tags,
      languageId: records.languageId,
      ecosystemId: records.ecosystemId,
      speciesId: records.speciesId,
      fingerprint: records.fingerprint,
    })
    .from(records)
    .where(scope === "ai-safe" ? aiSafeRecordsWhere() : visibleRecordsWhere(viewer));
  const ids = rows.map((r) => r.id);
  const links = ids.length
    ? await db.select({ recordId: recordEntities.recordId, entityId: recordEntities.entityId }).from(recordEntities).where(inArray(recordEntities.recordId, ids))
    : [];
  const byRecord = new Map<string, string[]>();
  for (const l of links) byRecord.set(l.recordId, [...(byRecord.get(l.recordId) ?? []), l.entityId]);

  const [entityRows, languageRows, ecosystemRows, speciesRows] = await Promise.all([
    db.select({ id: entities.id, name: entities.name }).from(entities),
    db.select({ id: languages.id, name: languages.name }).from(languages),
    db.select({ id: ecosystems.id, name: ecosystems.name }).from(ecosystems),
    db.select({ id: species.id, name: species.commonName }).from(species),
  ]);
  const engineRecords: EngineRecord[] = rows.map((r) => ({ ...r, entityIds: byRecord.get(r.id) ?? [], fingerprint: r.fingerprint ?? null }));
  const subjectNames = new Map<string, string>([
    ...languageRows.map((l) => [l.id, `the ${l.name} language`] as [string, string]),
    ...ecosystemRows.map((e) => [e.id, `the ${e.name}`] as [string, string]),
    ...speciesRows.map((s) => [s.id, `the ${s.name}`] as [string, string]),
  ]);
  const context = buildEngineContext(engineRecords, new Map(entityRows.map((e) => [e.id, e.name])), subjectNames);
  return { records: engineRecords, context };
}

export interface RelatedRecord extends ScoredConnection {
  slug: string;
  title: string;
  dimension: EngineRecord["dimension"];
  reviewStatus: "proposed" | "accepted" | "rejected" | null;
  edgeId: string | null;
}

/** Live Connection Engine results for one record, annotated with any stored review decision. */
export async function relatedRecords(recordId: string, viewer: Viewer | null, limit = 8): Promise<RelatedRecord[]> {
  const { records: all, context } = await loadEngineRecords(viewer);
  const target = all.find((r) => r.id === recordId);
  if (!target) return [];
  const ranked = rankRelated(target, all, context, limit + 4);
  const db = await getDb();
  const stored = ranked.length
    ? await db
        .select({ id: edges.id, sourceId: edges.sourceId, targetId: edges.targetId, status: edges.status })
        .from(edges)
        .where(
          and(
            eq(edges.sourceType, "record"),
            eq(edges.targetType, "record"),
            or(eq(edges.sourceId, recordId), eq(edges.targetId, recordId)),
          ),
        )
    : [];
  const byPair = new Map(stored.map((e) => [e.sourceId === recordId ? e.targetId : e.sourceId, e]));
  const bySlug = new Map(all.map((r) => [r.id, r]));
  return ranked
    .map((c) => {
      const other = bySlug.get(c.targetId)!;
      const edge = byPair.get(c.targetId);
      return {
        ...c,
        slug: other.slug,
        title: other.title,
        dimension: other.dimension,
        reviewStatus: (edge?.status as RelatedRecord["reviewStatus"]) ?? null,
        edgeId: edge?.id ?? null,
      };
    })
    .filter((c) => c.reviewStatus !== "rejected")
    .slice(0, limit);
}
