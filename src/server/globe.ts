import { and, eq, isNotNull } from "drizzle-orm";
import { DIMENSION_COLORS } from "@/components/brand/DimensionGlyph";
import { IUCN_COLORS, LANGUAGE_STATUS_COLORS, ALERT_COLORS } from "@/components/ui/Badge";
import type { Viewer } from "@/lib/access/policy";
import { visibleRecordsWhere } from "@/lib/access/policy";
import { getDb } from "@/lib/db/client";
import { conservationProjects, countries, ecosystems, edges, languages, records, species } from "@/lib/db/schema";
import type { GlobeArc, GlobePoint, GlobeRing } from "@/components/globe/types";
import { getAllAlerts } from "./alerts";

export interface GlobeData {
  points: GlobePoint[];
  rings: GlobeRing[];
  arcs: GlobeArc[];
  countryCounts: Record<string, number>;
  countries: Array<{ code: string; name: string; nameRu: string; lat: number; lng: number }>;
}

export async function getGlobeData(viewer: Viewer | null): Promise<GlobeData> {
  const db = await getDb();
  const [recordRows, languageRows, speciesRows, ecosystemRows, projectRows, countryRows, engineEdges, alerts] = await Promise.all([
    db
      .select({ id: records.id, slug: records.slug, title: records.title, dimension: records.dimension, kind: records.kind, lat: records.lat, lng: records.lng, countryCode: records.countryCode, countryCodes: records.countryCodes, periodStart: records.periodStart, periodEnd: records.periodEnd, placeName: records.placeName, origin: records.origin })
      .from(records)
      .where(and(visibleRecordsWhere(viewer), isNotNull(records.lat), isNotNull(records.lng))),
    db.select({ id: languages.id, slug: languages.slug, name: languages.name, status: languages.status, lat: languages.lat, lng: languages.lng, family: languages.family }).from(languages).where(isNotNull(languages.lat)),
    db.select({ id: species.id, slug: species.slug, name: species.commonName, sci: species.scientificName, status: species.iucnStatus, lat: species.lat, lng: species.lng }).from(species).where(isNotNull(species.lat)),
    db.select({ id: ecosystems.id, slug: ecosystems.slug, name: ecosystems.name, kind: ecosystems.kind, lat: ecosystems.lat, lng: ecosystems.lng }).from(ecosystems).where(isNotNull(ecosystems.lat)),
    db.select({ slug: conservationProjects.slug, name: conservationProjects.name, organization: conservationProjects.organization, lat: conservationProjects.lat, lng: conservationProjects.lng }).from(conservationProjects).where(isNotNull(conservationProjects.lat)),
    db.select({ code: countries.code, name: countries.name, nameRu: countries.nameRu, lat: countries.lat, lng: countries.lng }).from(countries).where(isNotNull(countries.lat)),
    db.select({ sourceId: edges.sourceId, targetId: edges.targetId, confidence: edges.confidence, uncertainty: edges.uncertainty }).from(edges).where(and(eq(edges.provenance, "engine"), eq(edges.sourceType, "record"), eq(edges.targetType, "record"))),
    getAllAlerts(),
  ]);

  const points: GlobePoint[] = [
    ...recordRows.map((r) => ({
      id: r.id,
      layer: "record" as const,
      lat: r.lat!,
      lng: r.lng!,
      title: r.title,
      subtitle: r.placeName ?? "",
      href: `/archive/${r.slug}`,
      color: DIMENSION_COLORS[r.dimension],
      dimension: r.dimension,
      kind: r.kind,
      countryCode: r.countryCode,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      demo: r.origin === "demo",
    })),
    ...languageRows.map((l) => ({ id: l.id, layer: "language" as const, lat: l.lat!, lng: l.lng!, title: l.name, subtitle: l.family, href: `/languages/${l.slug}`, color: LANGUAGE_STATUS_COLORS[l.status], status: l.status })),
    ...speciesRows.map((s) => ({ id: s.id, layer: "species" as const, lat: s.lat!, lng: s.lng!, title: s.name, subtitle: s.sci, href: `/living-earth/species/${s.slug}`, color: IUCN_COLORS[s.status], status: s.status })),
    ...ecosystemRows.map((e) => ({ id: e.id, layer: "ecosystem" as const, lat: e.lat!, lng: e.lng!, title: e.name, subtitle: e.kind, href: `/living-earth/ecosystems/${e.slug}`, color: "#2fd8c4" })),
    ...projectRows.map((p) => ({ id: p.slug, layer: "project" as const, lat: p.lat!, lng: p.lng!, title: p.name, subtitle: p.organization, href: `/living-earth#project-${p.slug}`, color: "#e3eaf3" })),
  ];

  const recordById = new Map(recordRows.map((r) => [r.id, r]));
  const arcs: GlobeArc[] = engineEdges
    .map((e) => ({ a: recordById.get(e.sourceId), b: recordById.get(e.targetId), e }))
    .filter((x) => x.a && x.b && x.a.lat != null && x.b.lat != null && (Math.abs(x.a.lat! - x.b.lat!) + Math.abs(x.a.lng! - x.b.lng!) > 2))
    .map(({ a, b, e }) => ({
      startLat: a!.lat!,
      startLng: a!.lng!,
      endLat: b!.lat!,
      endLng: b!.lng!,
      colors: [DIMENSION_COLORS[a!.dimension], DIMENSION_COLORS[b!.dimension]],
      label: `${a!.title} ↔ ${b!.title}`,
      strength: e.confidence,
    }));

  const rings: GlobeRing[] = alerts
    .filter((a) => (a.level === "critical" || a.level === "high") && a.lat != null && a.lng != null)
    .slice(0, 24)
    .map((a) => ({ lat: a.lat!, lng: a.lng!, color: ALERT_COLORS[a.level], label: a.name, href: a.href, level: a.level }));

  const countryCounts: Record<string, number> = {};
  for (const r of recordRows) {
    const codes = new Set([r.countryCode, ...r.countryCodes].filter(Boolean) as string[]);
    for (const c of codes) countryCounts[c] = (countryCounts[c] ?? 0) + 1;
  }

  return {
    points,
    rings,
    arcs,
    countryCounts,
    countries: countryRows.map((c) => ({ code: c.code, name: c.name, nameRu: c.nameRu, lat: c.lat!, lng: c.lng! })),
  };
}
