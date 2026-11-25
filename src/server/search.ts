import { and, desc, or, sql } from "drizzle-orm";
import type { Viewer } from "@/lib/access/policy";
import { getDb } from "@/lib/db/client";
import { countries, ecosystems, entities, languages, records, species } from "@/lib/db/schema";
import { visibleRecordsWhere } from "@/lib/access/policy";
import { findRegion } from "@/lib/geo/regions";
import { foldForSearch } from "@/lib/text";
import { buildTsQuery, ftsMatch, ftsRank, fuzzyMatch, fuzzyScore } from "./query";

export type SearchHitType = "record" | "language" | "species" | "ecosystem" | "entity" | "place";

export interface SearchHit {
  type: SearchHitType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  score: number;
}

/**
 * Unified search across the archive, languages, Living Earth, knowledge-graph entities and
 * countries. Full-text matching with prefix terms, plus trigram similarity for typos.
 */
export async function unifiedSearch(query: string, viewer: Viewer | null, limit = 12): Promise<SearchHit[]> {
  const q = query.trim().slice(0, 200);
  if (q.length < 2) return [];
  const db = await getDb();
  const folded = foldForSearch(q);
  const tsq = buildTsQuery(q, "and");
  const per = Math.max(3, Math.ceil(limit / 2));

  const match = (searchCol: Parameters<typeof ftsMatch>[0], titleCol: Parameters<typeof fuzzyMatch>[1]) =>
    tsq ? or(ftsMatch(searchCol, tsq), fuzzyMatch(folded, titleCol)) : fuzzyMatch(folded, titleCol);
  const score = (searchCol: Parameters<typeof ftsRank>[0], titleCol: Parameters<typeof fuzzyScore>[1]) =>
    tsq ? sql<number>`(${ftsRank(searchCol, tsq)} + ${fuzzyScore(folded, titleCol)})` : fuzzyScore(folded, titleCol);

  const [recordRows, languageRows, speciesRows, ecosystemRows, entityRows, countryRows] = await Promise.all([
    db
      .select({ id: records.id, slug: records.slug, title: records.title, summary: records.summary, score: score(records.searchText, records.title) })
      .from(records)
      .where(and(visibleRecordsWhere(viewer), match(records.searchText, records.title)))
      .orderBy(desc(score(records.searchText, records.title)))
      .limit(per),
    db
      .select({ id: languages.id, slug: languages.slug, title: languages.name, family: languages.family, score: score(languages.searchText, languages.name) })
      .from(languages)
      .where(match(languages.searchText, languages.name))
      .orderBy(desc(score(languages.searchText, languages.name)))
      .limit(per),
    db
      .select({ id: species.id, slug: species.slug, title: species.commonName, sci: species.scientificName, score: score(species.searchText, species.commonName) })
      .from(species)
      .where(match(species.searchText, species.commonName))
      .orderBy(desc(score(species.searchText, species.commonName)))
      .limit(per),
    db
      .select({ id: ecosystems.id, slug: ecosystems.slug, title: ecosystems.name, kind: ecosystems.kind, score: score(ecosystems.searchText, ecosystems.name) })
      .from(ecosystems)
      .where(match(ecosystems.searchText, ecosystems.name))
      .orderBy(desc(score(ecosystems.searchText, ecosystems.name)))
      .limit(per),
    db
      .select({ id: entities.id, slug: entities.slug, title: entities.name, type: entities.type, score: score(entities.searchText, entities.name) })
      .from(entities)
      .where(match(entities.searchText, entities.name))
      .orderBy(desc(score(entities.searchText, entities.name)))
      .limit(per),
    db
      .select({ code: countries.code, name: countries.name, nameRu: countries.nameRu, subregion: countries.subregion, score: sql<number>`greatest(word_similarity(${folded}, lower(${countries.name})), word_similarity(${q.toLowerCase()}, lower(${countries.nameRu})))` })
      .from(countries)
      .where(or(sql`word_similarity(${folded}, lower(${countries.name})) > 0.6`, sql`word_similarity(${q.toLowerCase()}, lower(${countries.nameRu})) > 0.6`, sql`lower(${countries.code}) = ${folded}`))
      .orderBy(desc(sql`greatest(word_similarity(${folded}, lower(${countries.name})), word_similarity(${q.toLowerCase()}, lower(${countries.nameRu})))`))
      .limit(3),
  ]);

  const hits: SearchHit[] = [
    ...countryRows.map((c) => ({ type: "place" as const, id: c.code, title: c.name, subtitle: [c.nameRu, c.subregion].filter(Boolean).join(" · "), href: `/places/${c.code.toLowerCase()}`, score: Number(c.score) + 0.6 })),
    ...recordRows.map((r) => ({ type: "record" as const, id: r.id, title: r.title, subtitle: r.summary, href: `/archive/${r.slug}`, score: Number(r.score) })),
    ...languageRows.map((l) => ({ type: "language" as const, id: l.id, title: l.title, subtitle: l.family, href: `/languages/${l.slug}`, score: Number(l.score) + 0.05 })),
    ...speciesRows.map((s) => ({ type: "species" as const, id: s.id, title: s.title, subtitle: s.sci, href: `/living-earth/species/${s.slug}`, score: Number(s.score) })),
    ...ecosystemRows.map((e) => ({ type: "ecosystem" as const, id: e.id, title: e.title, subtitle: e.kind, href: `/living-earth/ecosystems/${e.slug}`, score: Number(e.score) })),
    ...entityRows.map((e) => ({ type: "entity" as const, id: e.id, title: e.title, subtitle: e.type.replace("_", " "), href: `/graph?node=entity:${e.slug}`, score: Number(e.score) * 0.8 })),
  ];

  const region = findRegion(q);
  if (region) {
    hits.unshift({ type: "place", id: region.label, title: region.label, subtitle: `${region.codes.length} countries`, href: `/archive?region=${encodeURIComponent(region.label)}`, score: 10 });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
