import { count, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { executeRows, getDb } from "@/lib/db/client";
import {
  conservationProjects,
  countries,
  ecosystems,
  edges,
  languages,
  records,
  reviews,
  species,
  users,
  type Dimension,
  type Origin,
  type Verification,
} from "@/lib/db/schema";

/** Live counts. Every number shown on the dashboard comes from here. */
export async function getGlobalStats() {
  const db = await getDb();
  const [
    [{ total }],
    byOrigin,
    byDimension,
    byVerification,
    countryRows,
    [{ languages: languageCount }],
    [{ species: speciesCount }],
    [{ ecosystems: ecosystemCount }],
    edgeRows,
    [{ projects }],
    [{ members }],
    [{ reviewCount }],
    centuryRows,
    continentRows,
    contributionRows,
  ] = await Promise.all([
    db.select({ total: count() }).from(records),
    db.select({ origin: records.origin, n: count() }).from(records).groupBy(records.origin),
    db.select({ dimension: records.dimension, n: count() }).from(records).groupBy(records.dimension),
    db.select({ verification: records.verification, n: count() }).from(records).groupBy(records.verification),
    executeRows<{ code: string }>(db, sql`select distinct unnest(array_append(${records.countryCodes}, ${records.countryCode})) as code from ${records}`),
    db.select({ languages: count() }).from(languages),
    db.select({ species: count() }).from(species),
    db.select({ ecosystems: count() }).from(ecosystems),
    db.select({ provenance: edges.provenance, status: edges.status, n: count() }).from(edges).groupBy(edges.provenance, edges.status),
    db.select({ projects: count() }).from(conservationProjects).where(eq(conservationProjects.status, "active")),
    db.select({ members: count() }).from(users).where(eq(users.isDemo, false)),
    db.select({ reviewCount: count() }).from(reviews),
    db
      .select({ century: sql<number>`floor(${records.periodStart}::numeric / 100)::int`, n: count() })
      .from(records)
      .where(isNotNull(records.periodStart))
      .groupBy(sql`floor(${records.periodStart}::numeric / 100)::int`),
    db
      .select({ continent: countries.continent, n: count() })
      .from(records)
      .innerJoin(countries, eq(countries.code, records.countryCode))
      .groupBy(countries.continent),
    db
      .select({ month: sql<string>`to_char(date_trunc('month', ${records.createdAt}), 'YYYY-MM')`, n: count() })
      .from(records)
      .where(inArray(records.origin, ["community"]))
      .groupBy(sql`to_char(date_trunc('month', ${records.createdAt}), 'YYYY-MM')`)
      .orderBy(sql`1`),
  ]);

  const originMap = Object.fromEntries(byOrigin.map((r) => [r.origin, r.n])) as Partial<Record<Origin, number>>;
  const dimensionMap = Object.fromEntries(byDimension.map((r) => [r.dimension, r.n])) as Partial<Record<Dimension, number>>;
  const verificationMap = Object.fromEntries(byVerification.map((r) => [r.verification, r.n])) as Partial<Record<Verification, number>>;
  const countryCodes = new Set(countryRows.map((r) => r.code).filter(Boolean));
  const engineProposed = edgeRows.filter((e) => e.provenance === "engine" && e.status === "proposed").reduce((s, e) => s + e.n, 0);
  const engineAccepted = edgeRows.filter((e) => e.provenance === "engine" && e.status === "accepted").reduce((s, e) => s + e.n, 0);
  const engineRejected = edgeRows.filter((e) => e.provenance === "engine" && e.status === "rejected").reduce((s, e) => s + e.n, 0);
  const editorial = edgeRows.filter((e) => e.provenance === "editorial").reduce((s, e) => s + e.n, 0);

  return {
    totalRecords: total,
    byOrigin: { reference: originMap.reference ?? 0, demo: originMap.demo ?? 0, community: originMap.community ?? 0 },
    byDimension: {
      human: dimensionMap.human ?? 0,
      cultural: dimensionMap.cultural ?? 0,
      historical: dimensionMap.historical ?? 0,
      natural: dimensionMap.natural ?? 0,
      scientific: dimensionMap.scientific ?? 0,
    },
    byVerification: {
      unverified: verificationMap.unverified ?? 0,
      community_verified: verificationMap.community_verified ?? 0,
      expert_verified: verificationMap.expert_verified ?? 0,
      disputed: verificationMap.disputed ?? 0,
    },
    verified: (verificationMap.community_verified ?? 0) + (verificationMap.expert_verified ?? 0),
    countries: countryCodes.size,
    languages: languageCount,
    species: speciesCount,
    ecosystems: ecosystemCount,
    environmentalRecords: (dimensionMap.natural ?? 0) + speciesCount + ecosystemCount,
    culturalRecords: dimensionMap.cultural ?? 0,
    connections: { engineProposed, engineAccepted, engineRejected, editorial },
    activeInitiatives: projects,
    communityMembers: members,
    reviews: reviewCount,
    byCentury: centuryRows.map((r) => ({ century: Number(r.century), n: r.n })).sort((a, b) => a.century - b.century),
    byContinent: continentRows.filter((r) => r.continent).map((r) => ({ continent: r.continent!, n: r.n })),
    contributionsByMonth: contributionRows.map((r) => ({ month: r.month, n: r.n })),
  };
}

export type GlobalStats = Awaited<ReturnType<typeof getGlobalStats>>;
