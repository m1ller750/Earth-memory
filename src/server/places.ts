import { arrayOverlaps, asc, eq } from "drizzle-orm";
import type { Viewer } from "@/lib/access/policy";
import { getDb } from "@/lib/db/client";
import { conservationProjects, countries, ecosystems, languages, records, species } from "@/lib/db/schema";
import { getAllAlerts } from "./alerts";
import { listRecords } from "./records";

export async function getPlace(code: string, viewer: Viewer | null, recordLimit = 24) {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return null;
  const db = await getDb();
  const [country] = await db.select().from(countries).where(eq(countries.code, upper)).limit(1);
  if (!country) return null;
  const [archive, langRows, speciesRows, ecoRows, projectRows, alerts] = await Promise.all([
    listRecords({ country: upper }, viewer, { limit: recordLimit, sort: "oldest" }),
    db.select().from(languages).where(arrayOverlaps(languages.countryCodes, [upper])).orderBy(asc(languages.name)),
    db.select().from(species).where(arrayOverlaps(species.countryCodes, [upper])).orderBy(asc(species.commonName)),
    db.select().from(ecosystems).where(arrayOverlaps(ecosystems.countryCodes, [upper])).orderBy(asc(ecosystems.name)),
    db.select().from(conservationProjects).where(arrayOverlaps(conservationProjects.countryCodes, [upper])).orderBy(asc(conservationProjects.name)),
    getAllAlerts(),
  ]);
  return {
    country,
    records: archive.items,
    recordTotal: archive.total,
    languages: langRows,
    species: speciesRows,
    ecosystems: ecoRows,
    projects: projectRows,
    alerts: alerts.filter((a) => a.countryCodes.includes(upper)).slice(0, 6),
  };
}

export type Place = NonNullable<Awaited<ReturnType<typeof getPlace>>>;

/** Compact summary used by the globe panel, the API and the MCP server. */
export async function getPlaceSummary(code: string, viewer: Viewer | null) {
  const place = await getPlace(code, viewer, 6);
  if (!place) return null;
  return {
    code: place.country.code,
    name: place.country.name,
    nameRu: place.country.nameRu,
    subregion: place.country.subregion,
    continent: place.country.continent,
    counts: {
      records: place.recordTotal,
      languages: place.languages.length,
      species: place.species.length,
      ecosystems: place.ecosystems.length,
      initiatives: place.projects.length,
    },
    records: place.records.map((r) => ({ slug: r.slug, title: r.title, dimension: r.dimension, kind: r.kind, verification: r.verification, origin: r.origin, href: `/archive/${r.slug}` })),
    languages: place.languages.map((l) => ({ slug: l.slug, name: l.name, status: l.status, href: `/languages/${l.slug}` })),
    species: place.species.map((s) => ({ slug: s.slug, name: s.commonName, iucnStatus: s.iucnStatus, href: `/living-earth/species/${s.slug}` })),
    alerts: place.alerts.map((a) => ({ name: a.name, score: a.score, level: a.level, subjectType: a.subjectType, href: `/alerts/${a.subjectType}/${a.slug}` })),
    href: `/places/${place.country.code.toLowerCase()}`,
  };
}
