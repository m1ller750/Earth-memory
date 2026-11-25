import { and, arrayOverlaps, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { aiSafeRecordsWhere } from "@/lib/access/policy";
import type { Intent } from "@/lib/ai/intent";
import { getDb } from "@/lib/db/client";
import {
  ecosystemObservations,
  ecosystems,
  edges,
  entities,
  IUCN_STATUSES,
  languages,
  LANGUAGE_STATUSES,
  records,
  species,
  type Dimension,
} from "@/lib/db/schema";
import { countryName } from "@/lib/geo/countries";
import { tokenize, truncate } from "@/lib/text";
import { getAllAlerts } from "../alerts";
import { getDiscoveries } from "../connections";
import { buildTsQuery, ftsMatch, ftsRank } from "../query";

export interface AiSource {
  n: number;
  type: "record" | "language" | "species" | "ecosystem" | "observation" | "connection";
  title: string;
  href: string;
  /** Short facts shown to the user and given to the model. */
  facts: string[];
  /** Longer excerpt for the model only. */
  excerpt: string;
  provenance: "reference" | "demo" | "community" | "editorial" | "engine";
  dimension?: Dimension;
}

export interface Retrieval {
  intent: Intent;
  sources: AiSource[];
  /** Facts about what the archive lacks, used by both answer modes. */
  gaps: string[];
  ecosystemName?: string;
}

const SEVERITY_ORDER = ["critically_endangered", "severely_endangered", "definitely_endangered", "vulnerable", "extinct", "safe"] as const;
const IUCN_ORDER = ["CR", "EN", "VU", "NT", "DD", "LC", "EW", "EX"] as const;

/** Question words that carry no topic (English and Russian), dropped before full-text search. */
const STOPWORDS = new Set(
  (
    "the and for are was were what which who whom whose when where why how about tell show give find list explain describe " +
    "there their them they this that these those with from into onto over under than then have has had does did doing " +
    "can could would should will shall may might must any all some many much more most other such only also very just " +
    "please know want like you your yours our ours its it's not but out who's what's archive archives record records memory memories earth " +
    "что как где когда почему какие какой какая каких кто это эти этот эта там тут для про при над под или его ее их они " +
    "расскажи расскажите покажи покажите найди найдите есть быть был была были было архив архиве записи память"
  ).split(/\s+/),
);

/** Words in a question that name a kind of ecosystem (English and Russian). */
const ECOSYSTEM_KIND_WORDS: Array<[RegExp, string]> = [
  [/glacier|ice ?(?:field|cap|sheet)s?|ледник/i, "glacier"],
  [/\blakes?\b|озер/i, "lake"],
  [/\breefs?\b|coral|риф|корал/i, "reef"],
  [/forest|woodland|лес/i, "forest"],
  [/wetland|marsh|swamp|\bdeltas?\b|болот|дельт/i, "wetland"],
  [/mangrove|мангр/i, "mangrove"],
  [/grassland|savann?a|steppe|prairie|степ|саванн/i, "grassland"],
  [/desert|пустын/i, "desert"],
  [/\boceans?\b|\bseas?\b|океан|мор[ея]/i, "ocean"],
];
/** Search terms for archive records about each kind of ecosystem. */
const ECOSYSTEM_SEARCH_TERMS: Array<[string, string]> = [
  ["glacier", "glacier glaciers ice"],
  ["lake", "lake lakes"],
  ["reef", "reef coral bleaching"],
  ["forest", "forest rainforest deforestation"],
  ["wetland", "wetland marsh delta swamp"],
  ["mangrove", "mangrove mangroves"],
  ["grassland", "grassland savanna steppe"],
  ["desert", "desert desertification"],
  ["ocean", "ocean sea marine"],
];

function countries(codes: string[]): string {
  return codes
    .slice(0, 6)
    .map((c) => countryName(c, "en"))
    .join(", ");
}

/** Retrieves archive material for a question. Only public, non-sensitive records are used. */
export async function retrieveForIntent(intent: Intent, question: string, limit = 8): Promise<Retrieval> {
  const db = await getDb();
  const sources: Omit<AiSource, "n">[] = [];
  const gaps: string[] = [];
  const regionCodes = intent.region?.codes ?? null;
  const recordRegion = regionCodes ? or(inArray(records.countryCode, regionCodes), arrayOverlaps(records.countryCodes, regionCodes)) : undefined;

  const recordSource = (r: typeof records.$inferSelect): Omit<AiSource, "n"> => ({
    type: "record",
    title: r.title,
    href: `/archive/${r.slug}`,
    facts: [
      [r.placeName, r.countryCodes.length ? countries(r.countryCodes) : r.countryCode ? countryName(r.countryCode, "en") : null].filter(Boolean).join(" — "),
      r.dateLabel ?? "",
      r.origin === "demo" ? "Demo record (fictional)" : r.origin === "reference" ? "Reference record, pending verification" : "Community contribution",
    ].filter(Boolean),
    excerpt: truncate(`${r.summary}\n${r.body}`, 1800),
    provenance: r.origin,
    dimension: r.dimension,
  });

  switch (intent.kind) {
    case "languages": {
      const rows = await db
        .select()
        .from(languages)
        .where(regionCodes ? arrayOverlaps(languages.countryCodes, regionCodes) : inArray(languages.status, [...LANGUAGE_STATUSES].filter((s) => s !== "safe")))
        .orderBy(sql`array_position(array[${sql.join(SEVERITY_ORDER.map((s) => sql`${s}`), sql`, `)}]::text[], ${languages.status}::text)`, asc(languages.name))
        .limit(limit + 4);
      for (const l of rows) {
        sources.push({
          type: "language",
          title: l.name,
          href: `/languages/${l.slug}`,
          facts: [`Status: ${l.status.replace(/_/g, " ")} (${l.statusSource})`, `Family: ${l.family}`, `Where: ${countries(l.countryCodes)}`],
          excerpt: truncate(l.description, 900),
          provenance: "reference",
        });
      }
      if (regionCodes && rows.length === 0) gaps.push(`No language profiles for ${intent.region!.label} are in the archive yet.`);
      break;
    }
    case "species": {
      // Questions about extinction get the extinct and extinct-in-the-wild species first.
      const extinction = /extinct|extinction|died out|last (?:known|individual|of)|вымер|вымира|исчезнувш|последн/i.test(question);
      const statuses = extinction ? (["EX", "EW", "CR"] as const) : (["CR", "EN", "VU", "NT", "DD"] as const);
      const order = extinction ? ["EX", "EW", "CR"] : IUCN_ORDER;
      const rows = await db
        .select()
        .from(species)
        .where(and(regionCodes ? arrayOverlaps(species.countryCodes, regionCodes) : undefined, inArray(species.iucnStatus, [...statuses])))
        .orderBy(sql`array_position(array[${sql.join(order.map((s) => sql`${s}`), sql`, `)}]::text[], ${species.iucnStatus}::text)`, asc(species.commonName))
        .limit(limit + 4);
      for (const s of rows) {
        sources.push({
          type: "species",
          title: `${s.commonName} (${s.scientificName})`,
          href: `/living-earth/species/${s.slug}`,
          facts: [`IUCN: ${s.iucnStatus} — ${s.assessmentNote}`, `Range: ${countries(s.countryCodes)}`, ...(s.habitat ? [`Habitat: ${s.habitat}`] : [])],
          excerpt: truncate(s.description, 1300),
          provenance: "reference",
        });
      }
      if (rows.length === 0) gaps.push(`No threatened species${intent.region ? ` in ${intent.region.label}` : ""} are documented in the archive yet.`);
      if (!IUCN_STATUSES.length) break;
      break;
    }
    case "traditions": {
      const alerts = (await getAllAlerts()).filter((a) => a.subjectType === "tradition" && (!regionCodes || a.countryCodes.some((c) => regionCodes.includes(c))));
      const ids = alerts.slice(0, limit + 2).map((a) => a.id);
      const rows = ids.length ? await db.select().from(records).where(and(aiSafeRecordsWhere(), inArray(records.id, ids))) : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const a of alerts) {
        const r = byId.get(a.id);
        if (!r) continue;
        const src = recordSource(r);
        src.facts.unshift(`Memory Alert ${a.score}/100 (${a.level}); ${a.threatCategory.replace(/_/g, " ")}`);
        sources.push(src);
      }
      if (sources.length === 0) gaps.push(`No traditions${intent.region ? ` in ${intent.region.label}` : ""} are documented yet.`);
      break;
    }
    case "ecosystem_change": {
      const slug = intent.ecosystemHint;
      const observationCount = sql`(select count(*) from ${ecosystemObservations} o where o.ecosystem_id = ${ecosystems.id})`;
      const regionEco = regionCodes ? arrayOverlaps(ecosystems.countryCodes, regionCodes) : undefined;
      const kinds = ECOSYSTEM_KIND_WORDS.filter(([re]) => re.test(question)).map(([, kind]) => kind);
      let ecos: (typeof ecosystems.$inferSelect)[] = [];
      if (slug) ecos = await db.select().from(ecosystems).where(eq(ecosystems.slug, slug)).limit(1);
      // A kind of ecosystem ("glaciers", "lakes") or a region: every matching ecosystem, best documented first.
      if (!ecos.length && (kinds.length || regionEco)) {
        ecos = await db
          .select()
          .from(ecosystems)
          .where(and(kinds.length ? inArray(ecosystems.kind, kinds) : undefined, regionEco))
          .orderBy(desc(observationCount), asc(ecosystems.name))
          .limit(4);
      }
      const fallback = !ecos.length;
      if (fallback) ecos = await db.select().from(ecosystems).orderBy(desc(observationCount)).limit(1);
      if (!ecos.length) break;
      if (fallback) gaps.push(`No matching ecosystem was found, so the most thoroughly documented one (${ecos[0].name}) is shown.`);

      // Share the source budget across ecosystems: each gets its profile and its latest observations.
      const perEcosystem = ecos.length === 1 ? limit : Math.max(2, Math.floor(limit / ecos.length));
      for (const eco of ecos) {
        sources.push({ type: "ecosystem", title: eco.name, href: `/living-earth/ecosystems/${eco.slug}`, facts: [`Status: ${eco.statusNote}`, `Countries: ${countries(eco.countryCodes)}`], excerpt: truncate(eco.description, ecos.length > 1 ? 600 : 1000), provenance: "reference" });
        const obs = await db.select().from(ecosystemObservations).where(eq(ecosystemObservations.ecosystemId, eco.id)).orderBy(desc(ecosystemObservations.year)).limit(perEcosystem);
        for (const o of obs.reverse()) {
          sources.push({
            type: "observation",
            title: `${eco.name}, ${o.year}${o.yearEnd ? `–${o.yearEnd}` : ""}: ${o.title}`,
            href: `/living-earth/ecosystems/${eco.slug}#observations`,
            facts: [`Source: ${o.sourceCitation}`, `Reliability: ${o.reliability}`],
            excerpt: o.observation,
            provenance: "reference",
          });
        }
      }
      // Archive records about the same kind of place (e.g. Okjökull or Chacaltaya for glaciers).
      const kindQuery = kinds.length ? buildTsQuery(ECOSYSTEM_SEARCH_TERMS.filter(([k]) => kinds.includes(k)).map(([, terms]) => terms).join(" "), "or") : null;
      const recs = await db
        .select()
        .from(records)
        .where(and(aiSafeRecordsWhere(), recordRegion, kindQuery ? ftsMatch(records.searchText, kindQuery) : inArray(records.ecosystemId, ecos.map((e) => e.id))))
        .orderBy(kindQuery ? desc(ftsRank(records.searchText, kindQuery)) : asc(records.title))
        .limit(3);
      for (const r of recs) sources.push(recordSource(r));
      return { intent, sources: sources.slice(0, limit + 6).map((s, i) => ({ ...s, n: i + 1 })), gaps, ecosystemName: ecos.map((e) => e.name).join(", ") };
    }
    case "photographs": {
      const rows = await db.select().from(records).where(and(aiSafeRecordsWhere(), eq(records.kind, "photograph"), recordRegion)).limit(limit);
      for (const r of rows) sources.push(recordSource(r));
      if (rows.length === 0) {
        gaps.push("The archive does not hold any photographs matching this question yet.");
        const tsq = buildTsQuery(question, "or");
        const related = tsq
          ? await db
              .select()
              .from(records)
              .where(and(aiSafeRecordsWhere(), recordRegion, ftsMatch(records.searchText, tsq)))
              .orderBy(desc(ftsRank(records.searchText, tsq)))
              .limit(5)
          : [];
        for (const r of related) sources.push(recordSource(r));
      }
      break;
    }
    case "connections": {
      if (intent.civilizations) {
        const civ = await db.select().from(entities).where(eq(entities.type, "civilization"));
        const ids = civ.map((c) => c.id);
        const links = ids.length
          ? await db
              .select()
              .from(edges)
              .where(and(eq(edges.status, "accepted"), or(and(eq(edges.sourceType, "entity"), inArray(edges.sourceId, ids)), and(eq(edges.targetType, "entity"), inArray(edges.targetId, ids)))))
              .limit(40)
          : [];
        const names = new Map(civ.map((c) => [c.id, c.name]));
        const otherIds = [...new Set(links.flatMap((l) => [l.sourceId, l.targetId]))];
        const others = otherIds.length ? await db.select({ id: entities.id, name: entities.name }).from(entities).where(inArray(entities.id, otherIds)) : [];
        for (const o of others) if (!names.has(o.id)) names.set(o.id, o.name);
        for (const l of links.slice(0, limit)) {
          const a = names.get(l.sourceId) ?? l.sourceType;
          const b = names.get(l.targetId) ?? l.targetType;
          sources.push({
            type: "connection",
            title: `${a} — ${l.relation.replace(/_/g, " ")} — ${b}`,
            href: `/graph?node=${l.sourceType}:${l.sourceId}`,
            facts: [`Certainty: ${l.uncertainty}`, ...(l.citation ? [`Citation: ${l.citation}`] : [])],
            excerpt: l.evidence.map((e) => e.detail).join(" "),
            provenance: "editorial",
          });
        }
      }
      for (const d of await getDiscoveries({ limit: 4 })) {
        sources.push({
          type: "connection",
          title: `${d.a.title} ↔ ${d.b.title}`,
          href: `/archive/${d.a.slug}`,
          facts: [`Proposed by the Connection Engine, strength ${d.confidence.toFixed(2)}, ${d.uncertainty}`, "Awaiting expert review"],
          excerpt: d.evidence.map((e) => e.detail).join("; "),
          provenance: "engine",
        });
      }
      break;
    }
    case "multi_country": {
      const rows = await db
        .select()
        .from(records)
        .where(and(aiSafeRecordsWhere(), eq(records.dimension, "cultural"), sql`cardinality(${records.countryCodes}) >= 2`, recordRegion))
        .orderBy(desc(sql`cardinality(${records.countryCodes})`), asc(records.title))
        .limit(limit);
      for (const r of rows) {
        const src = recordSource(r);
        src.facts.unshift(`Shared by ${r.countryCodes.length} countries: ${countries(r.countryCodes)}${r.countryCodes.length > 6 ? "…" : ""}`);
        sources.push(src);
      }
      break;
    }
    case "general": {
      // Only meaningful words: filler such as "tell me about the" would otherwise match every record.
      const terms = [...new Set(tokenize(question))].filter((t) => t.length > 2 && !STOPWORDS.has(t)).slice(0, 10);
      const tsq = terms.length ? terms.map((t) => `${t}:*`).join(" | ") : null;
      if (tsq) {
        const rows = await db
          .select()
          .from(records)
          .where(and(aiSafeRecordsWhere(), recordRegion, ftsMatch(records.searchText, tsq)))
          .orderBy(desc(ftsRank(records.searchText, tsq)))
          .limit(limit);
        for (const r of rows) sources.push(recordSource(r));
        const langs = await db.select().from(languages).where(ftsMatch(languages.searchText, tsq)).orderBy(desc(ftsRank(languages.searchText, tsq))).limit(3);
        for (const l of langs)
          sources.push({ type: "language", title: l.name, href: `/languages/${l.slug}`, facts: [`Status: ${l.status.replace(/_/g, " ")}`, `Where: ${countries(l.countryCodes)}`], excerpt: truncate(l.description, 700), provenance: "reference" });
        const sp = await db.select().from(species).where(ftsMatch(species.searchText, tsq)).orderBy(desc(ftsRank(species.searchText, tsq))).limit(2);
        for (const s of sp)
          sources.push({ type: "species", title: s.commonName, href: `/living-earth/species/${s.slug}`, facts: [`IUCN: ${s.iucnStatus}`], excerpt: truncate(s.description, 700), provenance: "reference" });
      }
      if (sources.length === 0) gaps.push("Nothing in the archive matches this question yet.");
      break;
    }
  }
  return { intent, sources: sources.slice(0, limit + 2).map((s, i) => ({ ...s, n: i + 1 })), gaps };
}
