import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";
import { getDb } from "@/lib/db/client";
import {
  conservationProjects,
  ecosystemObservations,
  ecosystems,
  languages,
  lexiconEntries,
  media,
  recordEntities,
  records,
  sources,
  species,
} from "@/lib/db/schema";
import { computeAlert, IUCN_THREAT, LANGUAGE_THREAT, rankAlerts, type AlertInput, type AlertSubjectType, type MemoryAlert } from "@/lib/engine/alerts";

type CountMap = Map<string, number>;

async function countBy(query: Promise<Array<{ key: string | null; n: number }>>): Promise<CountMap> {
  const rows = await query;
  return new Map(rows.filter((r) => r.key).map((r) => [r.key!, Number(r.n)]));
}

/**
 * Computes Memory Alerts for languages, traditions and at-risk archives, ecosystems and species.
 * Counts include every record in the archive (also community-restricted ones) because they
 * measure coverage; no restricted content is exposed.
 */
export const getAllAlerts = cache(async (): Promise<MemoryAlert[]> => {
  const db = await getDb();
  const verifiedExpr = sql<number>`count(*) filter (where ${records.verification} in ('community_verified','expert_verified'))::int`;

  const [
    langRows,
    speciesRows,
    ecoRows,
    traditionRows,
    sourceCounts,
    recordsByLanguage,
    verifiedByLanguage,
    lexiconByLanguage,
    audioByLanguage,
    recordsBySpecies,
    verifiedBySpecies,
    recordsByEcosystem,
    verifiedByEcosystem,
    observationsByEcosystem,
    mediaByRecord,
  ] = await Promise.all([
    db.select().from(languages),
    db.select().from(species),
    db.select().from(ecosystems),
    db
      .select({ id: records.id, slug: records.slug, title: records.title, lat: records.lat, lng: records.lng, countryCodes: records.countryCodes, tags: records.tags, verification: records.verification, kind: records.kind })
      .from(records)
      .where(and(eq(records.visibility, "public"), sql`(${records.kind} in ('tradition','practice') or 'archive at risk' = any(${records.tags}))`)),
    countBy(db.select({ key: sql<string>`${sources.subjectId}::text`, n: sql<number>`count(*)::int` }).from(sources).groupBy(sources.subjectId)),
    countBy(db.select({ key: records.languageId, n: sql<number>`count(*)::int` }).from(records).groupBy(records.languageId)),
    countBy(db.select({ key: records.languageId, n: verifiedExpr }).from(records).groupBy(records.languageId)),
    countBy(db.select({ key: lexiconEntries.languageId, n: sql<number>`count(*)::int` }).from(lexiconEntries).groupBy(lexiconEntries.languageId)),
    countBy(
      db
        .select({ key: lexiconEntries.languageId, n: sql<number>`count(${media.id})::int` })
        .from(lexiconEntries)
        .innerJoin(media, eq(media.lexiconEntryId, lexiconEntries.id))
        .where(eq(media.kind, "audio"))
        .groupBy(lexiconEntries.languageId),
    ),
    countBy(db.select({ key: records.speciesId, n: sql<number>`count(*)::int` }).from(records).groupBy(records.speciesId)),
    countBy(db.select({ key: records.speciesId, n: verifiedExpr }).from(records).groupBy(records.speciesId)),
    countBy(db.select({ key: records.ecosystemId, n: sql<number>`count(*)::int` }).from(records).groupBy(records.ecosystemId)),
    countBy(db.select({ key: records.ecosystemId, n: verifiedExpr }).from(records).groupBy(records.ecosystemId)),
    countBy(db.select({ key: ecosystemObservations.ecosystemId, n: sql<number>`count(*)::int` }).from(ecosystemObservations).groupBy(ecosystemObservations.ecosystemId)),
    countBy(db.select({ key: media.recordId, n: sql<number>`count(*)::int` }).from(media).groupBy(media.recordId)),
  ]);

  // Records that share at least one knowledge-graph entity with each tradition record.
  const traditionIds = traditionRows.map((r) => r.id);
  const siblings: CountMap = new Map();
  if (traditionIds.length) {
    const other = alias(recordEntities, "other");
    const rows = await db
      .select({ id: recordEntities.recordId, n: sql<number>`count(distinct ${other.recordId})::int` })
      .from(recordEntities)
      .innerJoin(other, and(eq(recordEntities.entityId, other.entityId), ne(recordEntities.recordId, other.recordId)))
      .where(inArray(recordEntities.recordId, traditionIds))
      .groupBy(recordEntities.recordId);
    for (const r of rows) siblings.set(r.id, Number(r.n));
  }

  const inputs: AlertInput[] = [];

  for (const l of langRows) {
    const linked = recordsByLanguage.get(l.id) ?? 0;
    inputs.push({
      subjectType: "language",
      id: l.id,
      slug: l.slug,
      name: l.name,
      href: `/languages/${l.slug}`,
      lat: l.lat,
      lng: l.lng,
      countryCodes: l.countryCodes,
      threat: { score: LANGUAGE_THREAT[l.status], category: l.status, source: l.statusSource },
      documentation: {
        linkedRecords: linked,
        verifiedRecords: verifiedByLanguage.get(l.id) ?? 0,
        media: 0,
        audio: audioByLanguage.get(l.id) ?? 0,
        lexicon: lexiconByLanguage.get(l.id) ?? 0,
        observations: 0,
        sources: sourceCounts.get(l.id) ?? 0,
      },
      flags: { noFirstLanguageSpeakers: l.status === "extinct" || /no first-language|last native speaker died/i.test(l.speakersNote ?? "") },
    });
  }

  for (const s of speciesRows) {
    inputs.push({
      subjectType: "species",
      id: s.id,
      slug: s.slug,
      name: s.commonName,
      href: `/living-earth/species/${s.slug}`,
      lat: s.lat,
      lng: s.lng,
      countryCodes: s.countryCodes,
      threat: { score: IUCN_THREAT[s.iucnStatus], category: s.iucnStatus, source: s.assessmentNote || "IUCN Red List" },
      documentation: {
        linkedRecords: recordsBySpecies.get(s.id) ?? 0,
        verifiedRecords: verifiedBySpecies.get(s.id) ?? 0,
        media: 0,
        audio: 0,
        lexicon: 0,
        observations: 0,
        sources: sourceCounts.get(s.id) ?? 0,
      },
    });
  }

  for (const e of ecoRows) {
    const obs = observationsByEcosystem.get(e.id) ?? 0;
    inputs.push({
      subjectType: "ecosystem",
      id: e.id,
      slug: e.slug,
      name: e.name,
      href: `/living-earth/ecosystems/${e.slug}`,
      lat: e.lat,
      lng: e.lng,
      countryCodes: e.countryCodes,
      threat: { score: Math.min(1, 0.4 + 0.1 * obs), category: "documented_transformation", source: e.statusNote || "Documented observations" },
      documentation: {
        linkedRecords: recordsByEcosystem.get(e.id) ?? 0,
        verifiedRecords: verifiedByEcosystem.get(e.id) ?? 0,
        media: 0,
        audio: 0,
        lexicon: 0,
        observations: obs,
        sources: sourceCounts.get(e.id) ?? 0,
      },
    });
  }

  for (const r of traditionRows) {
    const urgent = r.tags.includes("urgent safeguarding");
    const archiveAtRisk = r.tags.includes("archive at risk");
    inputs.push({
      subjectType: "tradition",
      id: r.id,
      slug: r.slug,
      name: r.title,
      href: `/archive/${r.slug}`,
      lat: r.lat,
      lng: r.lng,
      countryCodes: r.countryCodes,
      threat: {
        score: urgent ? 0.9 : archiveAtRisk ? 0.8 : 0.3,
        category: urgent ? "urgent_safeguarding" : archiveAtRisk ? "archive_at_risk" : "representative_list",
        source: urgent ? "UNESCO List of Intangible Cultural Heritage in Need of Urgent Safeguarding" : archiveAtRisk ? "Documented threat to the collection" : "UNESCO Representative List (inscription is not itself a threat)",
      },
      documentation: {
        linkedRecords: siblings.get(r.id) ?? 0,
        verifiedRecords: r.verification === "community_verified" || r.verification === "expert_verified" ? 1 : 0,
        media: mediaByRecord.get(r.id) ?? 0,
        audio: 0,
        lexicon: 0,
        observations: 0,
        sources: sourceCounts.get(r.id) ?? 0,
      },
      flags: { urgentSafeguarding: urgent, archiveAtRisk },
    });
  }

  return rankAlerts(inputs.map(computeAlert));
});

export async function getAlert(subjectType: AlertSubjectType, slug: string): Promise<MemoryAlert | null> {
  const all = await getAllAlerts();
  return all.find((a) => a.subjectType === subjectType && a.slug === slug) ?? null;
}

const FOCUS_FOR: Record<AlertSubjectType, string[]> = {
  language: ["language"],
  tradition: ["heritage", "archive", "language"],
  ecosystem: ["ecosystem", "species"],
  species: ["species", "ecosystem"],
};

/** Preservation initiatives working on the same kind of subject in at least one shared country. */
export async function organizationsFor(alert: MemoryAlert, limit = 3) {
  const db = await getDb();
  const rows = await db
    .select({ slug: conservationProjects.slug, name: conservationProjects.name, organization: conservationProjects.organization, url: conservationProjects.url, focus: conservationProjects.focus, countryCodes: conservationProjects.countryCodes })
    .from(conservationProjects)
    .where(inArray(conservationProjects.focus, FOCUS_FOR[alert.subjectType]));
  const scored = rows
    .map((r) => ({ ...r, overlap: r.countryCodes.filter((c) => alert.countryCodes.includes(c)).length }))
    .sort((a, b) => b.overlap - a.overlap);
  const local = scored.filter((r) => r.overlap > 0);
  return (local.length ? local : scored.filter((r) => r.focus === FOCUS_FOR[alert.subjectType][0])).slice(0, limit);
}
