import { and, arrayOverlaps, asc, count, desc, eq, gte, inArray, isNotNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { canViewRecord, type Viewer, visibleRecordsWhere } from "@/lib/access/policy";
import { getDb } from "@/lib/db/client";
import {
  aiAnnotations,
  communities,
  ecosystems,
  entities,
  languages,
  media,
  recordEntities,
  records,
  recordTranslations,
  reviews,
  sources,
  species,
  users,
  type Dimension,
  type Origin,
  type RecordKind,
  type Verification,
} from "@/lib/db/schema";
import { boundingBox, haversineKm } from "@/lib/geo/distance";
import { foldForSearch } from "@/lib/text";
import { buildTsQuery, ftsMatch, ftsRank, fuzzyMatch, fuzzyScore } from "./query";

export const recordListColumns = {
  id: records.id,
  slug: records.slug,
  title: records.title,
  summary: records.summary,
  dimension: records.dimension,
  kind: records.kind,
  countryCode: records.countryCode,
  countryCodes: records.countryCodes,
  placeName: records.placeName,
  lat: records.lat,
  lng: records.lng,
  periodStart: records.periodStart,
  periodEnd: records.periodEnd,
  dateLabel: records.dateLabel,
  verification: records.verification,
  origin: records.origin,
  visibility: records.visibility,
  tags: records.tags,
  createdAt: records.createdAt,
  coverMediaId: sql<string | null>`(select m.id from media m where m.record_id = ${records.id} and m.kind = 'image' order by m.created_at limit 1)`,
};

export type RecordListItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  dimension: Dimension;
  kind: RecordKind;
  countryCode: string | null;
  countryCodes: string[];
  placeName: string | null;
  lat: number | null;
  lng: number | null;
  periodStart: number | null;
  periodEnd: number | null;
  dateLabel: string | null;
  verification: Verification;
  origin: Origin;
  visibility: string;
  tags: string[];
  createdAt: Date;
  coverMediaId: string | null;
};

export interface RecordFilters {
  q?: string;
  dimension?: Dimension;
  kind?: RecordKind;
  country?: string;
  countries?: string[];
  verification?: Verification;
  origin?: Origin;
  from?: number;
  to?: number;
  tag?: string;
  languageId?: string;
  ecosystemId?: string;
  speciesId?: string;
  contributorId?: string;
  multiCountry?: boolean;
}

export type RecordSort = "relevance" | "newest" | "oldest" | "title";

function filterConditions(f: RecordFilters, viewer: Viewer | null): SQL[] {
  const conditions: SQL[] = [visibleRecordsWhere(viewer)];
  if (f.dimension) conditions.push(eq(records.dimension, f.dimension));
  if (f.kind) conditions.push(eq(records.kind, f.kind));
  if (f.country) conditions.push(or(eq(records.countryCode, f.country), arrayOverlaps(records.countryCodes, [f.country]))!);
  if (f.countries?.length) conditions.push(or(inArray(records.countryCode, f.countries), arrayOverlaps(records.countryCodes, f.countries))!);
  if (f.verification) conditions.push(eq(records.verification, f.verification));
  if (f.origin) conditions.push(eq(records.origin, f.origin));
  if (f.tag) conditions.push(arrayOverlaps(records.tags, [f.tag]));
  if (f.languageId) conditions.push(eq(records.languageId, f.languageId));
  if (f.ecosystemId) conditions.push(eq(records.ecosystemId, f.ecosystemId));
  if (f.speciesId) conditions.push(eq(records.speciesId, f.speciesId));
  if (f.contributorId) conditions.push(eq(records.contributorId, f.contributorId));
  if (f.multiCountry) conditions.push(sql`cardinality(${records.countryCodes}) >= 2`);
  // Period overlap: a record overlaps [from, to] when it starts before `to` and ends after `from`.
  if (f.to != null) conditions.push(and(isNotNull(records.periodStart), lte(records.periodStart, f.to))!);
  if (f.from != null) conditions.push(and(isNotNull(records.periodStart), gte(sql`coalesce(${records.periodEnd}, ${records.periodStart})`, f.from))!);
  return conditions;
}

export async function listRecords(
  filters: RecordFilters,
  viewer: Viewer | null,
  options: { limit?: number; offset?: number; sort?: RecordSort } = {},
): Promise<{ items: RecordListItem[]; total: number }> {
  const db = await getDb();
  const limit = Math.min(options.limit ?? 24, 100);
  const offset = options.offset ?? 0;
  const conditions = filterConditions(filters, viewer);

  const q = filters.q?.trim();
  const tsq = q ? buildTsQuery(q, "and") : null;
  let rank: SQL<number> | null = null;
  if (q) {
    const folded = foldForSearch(q);
    const textMatch = tsq ? or(ftsMatch(records.searchText, tsq), fuzzyMatch(folded, records.title)) : fuzzyMatch(folded, records.title);
    conditions.push(textMatch!);
    rank = tsq ? sql<number>`(${ftsRank(records.searchText, tsq)} + ${fuzzyScore(folded, records.title)} * 0.5)` : fuzzyScore(folded, records.title);
  }

  const where = and(...conditions);
  const sort = options.sort ?? (q ? "relevance" : "newest");
  const orderBy =
    sort === "relevance" && rank
      ? [desc(rank), asc(records.title)]
      : sort === "oldest"
        ? [sql`${records.periodStart} asc nulls last`, asc(records.title)]
        : sort === "title"
          ? [asc(records.title)]
          : [desc(records.createdAt), asc(records.title)];

  const [items, [{ total }]] = await Promise.all([
    db.select(recordListColumns).from(records).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(records).where(where),
  ]);
  return { items: items as RecordListItem[], total };
}

/** Count of records the viewer cannot see in the archive (shown as a gentle notice, never with titles). */
export async function hiddenRecordCount(viewer: Viewer | null): Promise<number> {
  const db = await getDb();
  const [{ visible }] = await db.select({ visible: count() }).from(records).where(visibleRecordsWhere(viewer));
  const [{ all }] = await db.select({ all: count() }).from(records);
  return all - visible;
}

export const getRecordBySlug = cache(async (slug: string, viewer: Viewer | null) => {
  const db = await getDb();
  const [row] = await db
    .select({
      record: records,
      contributorName: users.name,
      contributorIsDemo: users.isDemo,
      communityName: communities.name,
      communitySlug: communities.slug,
    })
    .from(records)
    .leftJoin(users, eq(users.id, records.contributorId))
    .leftJoin(communities, eq(communities.id, records.communityId))
    .where(eq(records.slug, slug))
    .limit(1);
  if (!row) return { status: "not_found" as const };
  if (!canViewRecord(viewer, row.record)) return { status: "restricted" as const };

  const id = row.record.id;
  const [recordSources, recordMedia, linkedEntities, recordReviews, translations, annotations, language, eco, sp] = await Promise.all([
    db.select().from(sources).where(and(eq(sources.subjectType, "record"), eq(sources.subjectId, id))),
    db.select().from(media).where(eq(media.recordId, id)).orderBy(asc(media.createdAt)),
    db
      .select({ id: entities.id, slug: entities.slug, name: entities.name, type: entities.type, provenance: recordEntities.provenance })
      .from(recordEntities)
      .innerJoin(entities, eq(entities.id, recordEntities.entityId))
      .where(eq(recordEntities.recordId, id)),
    db
      .select({ id: reviews.id, decision: reviews.decision, reviewerRole: reviews.reviewerRole, note: reviews.note, createdAt: reviews.createdAt, reviewerName: users.name, reviewerId: reviews.reviewerId })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.reviewerId))
      .where(eq(reviews.recordId, id))
      .orderBy(desc(reviews.createdAt)),
    db.select().from(recordTranslations).where(eq(recordTranslations.recordId, id)),
    db
      .select()
      .from(aiAnnotations)
      .where(and(eq(aiAnnotations.subjectType, "record"), eq(aiAnnotations.subjectId, id), ne(aiAnnotations.status, "rejected")))
      .orderBy(desc(aiAnnotations.createdAt)),
    row.record.languageId
      ? db.select({ slug: languages.slug, name: languages.name, status: languages.status }).from(languages).where(eq(languages.id, row.record.languageId)).limit(1)
      : Promise.resolve([]),
    row.record.ecosystemId
      ? db.select({ slug: ecosystems.slug, name: ecosystems.name }).from(ecosystems).where(eq(ecosystems.id, row.record.ecosystemId)).limit(1)
      : Promise.resolve([]),
    row.record.speciesId
      ? db.select({ slug: species.slug, name: species.commonName, status: species.iucnStatus }).from(species).where(eq(species.id, row.record.speciesId)).limit(1)
      : Promise.resolve([]),
  ]);

  return {
    status: "ok" as const,
    record: row.record,
    contributor: row.record.contributorId ? { id: row.record.contributorId, name: row.contributorName ?? "", isDemo: row.contributorIsDemo ?? false } : null,
    community: row.record.communityId ? { name: row.communityName ?? "", slug: row.communitySlug ?? "" } : null,
    sources: recordSources,
    media: recordMedia,
    entities: linkedEntities,
    reviews: recordReviews,
    translations,
    annotations,
    language: language[0] ?? null,
    ecosystem: eco[0] ?? null,
    species: sp[0] ?? null,
  };
});

export type RecordDetail = Extract<Awaited<ReturnType<typeof getRecordBySlug>>, { status: "ok" }>;

export async function nearbyRecords(lat: number, lng: number, viewer: Viewer | null, excludeId?: string, radiusKm = 400, limit = 6) {
  const db = await getDb();
  const box = boundingBox(lat, lng, radiusKm);
  const rows = await db
    .select(recordListColumns)
    .from(records)
    .where(
      and(
        visibleRecordsWhere(viewer),
        excludeId ? ne(records.id, excludeId) : undefined,
        isNotNull(records.lat),
        gte(records.lat, box.minLat),
        lte(records.lat, box.maxLat),
        gte(records.lng, box.minLng),
        lte(records.lng, box.maxLng),
      ),
    )
    .limit(60);
  return (rows as RecordListItem[])
    .map((r) => ({ ...r, distanceKm: haversineKm(lat, lng, r.lat!, r.lng!) }))
    .filter((r) => r.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export async function recordsBySlugs(slugs: string[], viewer: Viewer | null): Promise<RecordListItem[]> {
  if (slugs.length === 0) return [];
  const db = await getDb();
  const rows = await db.select(recordListColumns).from(records).where(and(visibleRecordsWhere(viewer), inArray(records.slug, slugs)));
  return rows as RecordListItem[];
}

export async function recordsByIds(ids: string[], viewer: Viewer | null): Promise<RecordListItem[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db.select(recordListColumns).from(records).where(and(visibleRecordsWhere(viewer), inArray(records.id, ids)));
  return rows as RecordListItem[];
}
