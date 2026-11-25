/**
 * Assembles archive records, languages, species, ecosystems and knowledge-graph entities from the
 * sources fetched for each manifest item. Deterministic: text is selected from the sources, never
 * generated; anything that cannot be sourced is left empty or the item is skipped and reported.
 */
import type { IucnStatus, LanguageStatus } from "../db/schema";
import type { ImportedDataset, SeedEcosystem, SeedEntity, SeedLanguage, SeedObservation, SeedRecord, SeedSource, SeedSpecies } from "../db/seed/types";
import { loadCountryCentroids } from "../geo/centroids";
import { countryName, isCountryCode } from "../geo/countries";
import { slugify } from "../text";
import type { EcosystemItem, LanguageItem, ManifestItem, RecordItem, SpeciesItem } from "./manifest";
import {
  articleProse,
  claimCoordinate,
  claimIds,
  claimIdsWithYear,
  claimQuantities,
  claimStrings,
  claimYears,
  clipParagraphs,
  cleanInline,
  cleanLeadParagraph,
  continuationAfterLead,
  countriesFromText,
  datedObservations,
  formatYear,
  infoboxField,
  infoboxSection,
  iucnFromInfobox,
  iucnStatusFrom,
  label,
  languageFamily,
  languageStatusFrom,
  parseCoordinates,
  parseInfobox,
  parseJinaDocument,
  speakersNote,
  summaryAndBody,
  taxonGroupFrom,
  taxonGroupFromDescription,
  unescoSentence,
  writingSystems,
  type InfoboxRow,
  type WikidataEntity,
  type WikidataYear,
} from "./parse";
import {
  classesAndCoordinates,
  countryCodesByQid,
  DiskCache,
  fetchWikidata,
  fetchWikipediaPages,
  glottologCoordinates,
  isDisambiguation,
  JinaReader,
  mapLimit,
  type Log,
  type WikiPage,
} from "./sources";

export const IMPORT_GENERATOR = "Earth Memory importer 0.2 (Jina Reader MCP + Wikipedia + Wikidata)";

export type { ImportedDataset };

export interface BuildReport {
  imported: Record<"records" | "languages" | "species" | "ecosystems" | "entities", number>;
  skipped: Array<{ wiki: string; reason: string }>;
  warnings: string[];
  jina: { read: number; failed: number; authenticated: boolean };
}

export interface ExistingData {
  recordSlugs: Set<string>;
  languageSlugs: Set<string>;
  speciesSlugs: Set<string>;
  ecosystemSlugs: Set<string>;
  entities: SeedEntity[];
}

export interface BuildOptions {
  cacheDir: string;
  refresh?: boolean;
  concurrency?: number;
  log?: Log;
  existing: ExistingData;
  today?: string;
}

type EntityType = SeedEntity["type"];

/** Properties whose values become knowledge-graph entities, most meaningful first. */
const ENTITY_PROPERTIES: Array<{ prop: string; type?: EntityType; max?: number }> = [
  { prop: "P361" }, // part of
  { prop: "P2596", type: "civilization" }, // culture
  { prop: "P921" }, // main subject
  { prop: "P793", type: "event" }, // significant event
  { prop: "P140", type: "concept" }, // religion
  { prop: "P112" }, // founded by
  { prop: "P170" }, // creator
  { prop: "P50" }, // author
  { prop: "P84" }, // architect
  { prop: "P61" }, // discoverer or inventor
  { prop: "P710", max: 2 }, // participant
  { prop: "P138", max: 1 }, // named after
  { prop: "P4552", type: "region", max: 1 }, // mountain range
  { prop: "P706", max: 1 }, // located on terrain feature
  { prop: "P206", max: 1 }, // located next to body of water
  { prop: "P276", max: 1 }, // location
];
/** Wikidata values that describe bookkeeping rather than history. */
const IGNORED_ENTITY_LABELS = /record modification|^unesco world heritage site$|^world heritage site$/i;
const MAX_ENTITIES_PER_RECORD = 5;

const PERSON_CLASS = "Q5";
const ORGANIZATION_CLASSES = new Set([
  "Q43229", "Q163740", "Q484652", "Q327333", "Q2385804", "Q3918", "Q33506", "Q166118", "Q7075", "Q1664720", "Q31855", "Q4830453",
  "Q783794", "Q891723", "Q15911314", "Q7210356", "Q1530022", "Q245065", "Q2659904", "Q955824", "Q1331793", "Q207694", "Q17431399",
]);
const EVENT_CLASSES = new Set(["Q1190554", "Q1656682", "Q178561", "Q198", "Q7944", "Q3839081", "Q8065", "Q645883", "Q350604", "Q13418847", "Q15275719", "Q2223653"]);

const DESIGNATION_RULES: Array<[RegExp, string]> = [
  [/urgent safeguarding/i, "urgent safeguarding"],
  [/in danger/i, "in danger"],
  [/representative list|intangible cultural heritage/i, "intangible heritage"],
  [/world heritage/i, "world heritage"],
  [/memory of the world/i, "memory of the world"],
  [/ramsar/i, "ramsar wetland"],
  [/biosphere reserve/i, "biosphere reserve"],
  [/global geopark/i, "geopark"],
];

interface ItemContext {
  page: WikiPage;
  entity?: WikidataEntity;
  rows: InfoboxRow[];
  prose: string[];
  lead: string[];
  geo?: WikiPage;
}

function wikipediaSource(page: WikiPage, today: string): SeedSource {
  return { citation: `Wikipedia, “${page.title}” (English Wikipedia, CC BY-SA 4.0; retrieved ${today})`, url: page.url, kind: "website" };
}

function wikidataSource(qid: string): SeedSource {
  return { citation: `Wikidata, item ${qid} (structured data, CC0)`, url: `https://www.wikidata.org/wiki/${qid}`, kind: "dataset" };
}

function stripDisambiguation(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function capitalize(text: string | undefined): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const unique = <T,>(items: T[]) => [...new Set(items)];

export async function buildDataset(manifest: ManifestItem[], options: BuildOptions): Promise<{ dataset: ImportedDataset; report: BuildReport }> {
  const log = options.log ?? (() => {});
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const cache = new DiskCache(options.cacheDir, options.refresh);
  const report: BuildReport = {
    imported: { records: 0, languages: 0, species: 0, ecosystems: 0, entities: 0 },
    skipped: [],
    warnings: [],
    jina: { read: 0, failed: 0, authenticated: false },
  };
  const skip = (item: ManifestItem, reason: string) => report.skipped.push({ wiki: item.wiki, reason });
  const warn = (message: string) => report.warnings.push(message);

  /* 1. Wikipedia: lead text, coordinates and Wikidata ids for every article named in the manifest. */
  const titles = unique(manifest.flatMap((i) => [i.wiki, ...(i.geoFrom ? [i.geoFrom] : [])]));
  log(`Wikipedia: looking up ${titles.length} articles…`);
  const pages = await fetchWikipediaPages(titles, cache, log);

  /* 2. Wikidata entities for the manifest items. */
  const itemPages = new Map<ManifestItem, WikiPage>();
  for (const item of manifest) {
    const page = pages.get(item.wiki);
    if (!page || page.missing) skip(item, "Wikipedia article not found");
    else if (isDisambiguation(page)) skip(item, `“${item.wiki}” leads to a disambiguation page`);
    else itemPages.set(item, page);
  }
  const qids = [...itemPages.values()].map((p) => p.qid).filter((q): q is string => Boolean(q));
  log(`Wikidata: loading ${qids.length} items…`);
  const wikidata = await fetchWikidata(qids, cache, undefined, log);
  const isoByQid = await countryCodesByQid(cache, log);

  /* 3. Labels for designations, statuses and graph targets; classes for typing entities. */
  const referenced = new Set<string>();
  for (const entity of wikidata.values()) {
    for (const prop of ["P141", "P1999", "P1435", "P282", "P131", "P279", ...ENTITY_PROPERTIES.map((p) => p.prop)]) for (const id of claimIds(entity, prop)) referenced.add(id);
  }
  const labels = await fetchWikidata([...referenced], cache, "labels|descriptions", log);
  const graphTargets = [...wikidata.values()].flatMap((e) => ENTITY_PROPERTIES.flatMap((p) => claimIds(e, p.prop)));
  const classes = await classesAndCoordinates(graphTargets.filter((id) => !isoByQid.has(id)), cache, log);

  /* 4. Jina Reader: parse every article (infobox, prose) through Jina's MCP server. */
  const jina = new JinaReader(cache, log);
  report.jina.authenticated = jina.authenticated;
  const documents = new Map<ManifestItem, { rows: InfoboxRow[]; prose: string[] }>();
  const items = [...itemPages.entries()];
  let done = 0;
  log(`Jina Reader: parsing ${items.length} articles (${jina.authenticated ? "with" : "without"} an API key)…`);
  await mapLimit(items, options.concurrency ?? 3, async ([item, page]) => {
    try {
      const doc = parseJinaDocument(await jina.read(page.url));
      documents.set(item, { rows: parseInfobox(doc.paragraphs), prose: articleProse(doc.paragraphs) });
      report.jina.read++;
    } catch (error) {
      report.jina.failed++;
      warn(`Jina could not read ${page.title}: ${error instanceof Error ? error.message.slice(0, 160) : error}`);
      documents.set(item, { rows: [], prose: [] });
    }
    done++;
    if (done % 20 === 0 || done === items.length) log(`  parsed ${done}/${items.length}`);
  });
  await jina.close();

  const centroids = loadCountryCentroids();
  const context = (item: ManifestItem): ItemContext => {
    const page = itemPages.get(item)!;
    const doc = documents.get(item) ?? { rows: [], prose: [] };
    const candidate = item.geoFrom ? pages.get(item.geoFrom) : undefined;
    const geo = candidate && !candidate.missing && !isDisambiguation(candidate) ? candidate : undefined;
    if (item.geoFrom && !geo) warn(`${item.wiki}: geoFrom article “${item.geoFrom}” not found or ambiguous`);
    return {
      page,
      entity: page.qid ? wikidata.get(page.qid) : undefined,
      rows: doc.rows,
      prose: doc.prose,
      lead: page.extract.split("\n").map((p) => p.trim()).filter((p) => p.length > 0),
      geo,
    };
  };

  const isoCodes = (entity: WikidataEntity | undefined, props: string[]) =>
    unique(props.flatMap((p) => claimIds(entity, p)).map((id) => isoByQid.get(id)).filter((c): c is string => Boolean(c) && isCountryCode(c!)));

  const countriesOf = (item: ManifestItem, ctx: ItemContext, props = ["P17", "P495", "P183", "P1001"]) => {
    const fromManifest = (item.countries ?? []).filter((c) => isCountryCode(c));
    if (fromManifest.length) return fromManifest.slice(0, 8);
    const fromWikidata = isoCodes(ctx.entity, props);
    if (fromWikidata.length) return fromWikidata.slice(0, 8);
    return countriesFromText(infoboxField(ctx.rows, /^(?:country|countries|location|native to|state party)$/i)).slice(0, 8);
  };

  /** A curator's `geoFrom` wins (it names the place that represents the item), then the article's own coordinates. */
  const coordinatesOf = (item: ManifestItem, ctx: ItemContext, countries: string[], allowCentroid: boolean) => {
    if (ctx.geo?.lat != null && ctx.geo.lng != null) return { lat: ctx.geo.lat, lng: ctx.geo.lng, how: "geoFrom" as const };
    const own =
      (ctx.page.lat != null && ctx.page.lng != null ? { lat: ctx.page.lat, lng: ctx.page.lng } : undefined) ??
      claimCoordinate(ctx.entity) ??
      parseCoordinates(infoboxField(ctx.rows, /^coordinates$/i));
    if (own) return { ...own, how: "article" as const };
    if (item.approxGeo) return { lat: item.approxGeo[0], lng: item.approxGeo[1], how: "approximate" as const };
    const centroid = countries.length ? centroids.get(countries[0]) : undefined;
    if (allowCentroid && centroid) return { lat: centroid[0], lng: centroid[1], how: "country" as const };
    return undefined;
  };

  const aliasesOf = (ctx: ItemContext, title: string) =>
    unique([label(ctx.entity, "ru"), ...(ctx.entity?.aliases?.en ?? []).map((a) => a.value)].filter((a): a is string => typeof a === "string" && a !== title && a.length < 80)).slice(0, 6);

  const designationsOf = (entity: WikidataEntity | undefined) => {
    const tags: string[] = [];
    const years: Record<string, number> = {};
    for (const { id, year } of claimIdsWithYear(entity, "P1435")) {
      const name = label(labels.get(id)) ?? "";
      for (const [re, tag] of DESIGNATION_RULES) {
        if (!re.test(name)) continue;
        if (!tags.includes(tag)) tags.push(tag);
        if (year && !years[tag]) years[tag] = year;
        break;
      }
    }
    if (claimStrings(entity, "P757").length && !tags.includes("world heritage")) tags.push("world heritage");
    return { tags, years };
  };

  const description = (ctx: ItemContext, max: number) => clipParagraphs(ctx.lead.map(cleanLeadParagraph).filter(Boolean), max);

  /* ---------------------------------------------------------------- languages */
  const languages: SeedLanguage[] = [];
  const languageSlugs = new Set(options.existing.languageSlugs);
  for (const item of manifest.filter((i): i is LanguageItem => i.type === "language")) {
    if (!itemPages.has(item)) continue;
    const ctx = context(item);
    const name = stripDisambiguation(ctx.page.title).replace(/\s+language$/i, "");
    const slug = item.slug ?? slugify(item.wiki.replace(/\s+language$/i, ""));
    if (languageSlugs.has(slug)) {
      skip(item, `language “${slug}” already exists`);
      continue;
    }
    const atlas = unescoSentence(ctx.rows);
    const statusLabel = claimIds(ctx.entity, "P1999").map((id) => label(labels.get(id))).find(Boolean);
    const extinctRow = infoboxField(ctx.rows, /^(?:extinct|era)$/i);
    const nativeSpeakers = infoboxField(ctx.rows, /^native speakers$/i);
    let status: LanguageStatus | undefined = languageStatusFrom(atlas);
    let statusSource = "UNESCO Atlas of the World's Languages in Danger, as cited on Wikipedia";
    if (!status && statusLabel) {
      status = languageStatusFrom(statusLabel);
      statusSource = `UNESCO Atlas of the World's Languages in Danger, via Wikidata (${statusLabel})`;
    }
    if (!status && (extinctRow || /^none\b/i.test(nativeSpeakers ?? ""))) {
      status = "extinct";
      statusSource = `Wikipedia: no remaining native speakers${extinctRow ? ` (${cleanInline(extinctRow)})` : ""}`;
    }
    if (!status) {
      skip(item, "no UNESCO vitality status in the sources");
      continue;
    }
    // The curator's countries win; otherwise Wikidata's (which can include diaspora countries).
    const countries = (item.countries?.length ? item.countries : isoCodes(ctx.entity, ["P17"])).filter(isCountryCode).slice(0, 6);
    let coords: { lat: number; lng: number } | undefined = claimCoordinate(ctx.entity);
    const glottocode = claimStrings(ctx.entity, "P1394")[0] ?? /^[a-z]{4}\d{4}$/.exec(infoboxField(ctx.rows, /^glottolog$/i) ?? "")?.[0];
    if (!coords && glottocode) {
      try {
        coords = await glottologCoordinates(glottocode, cache, log);
      } catch (error) {
        warn(`${name}: Glottolog lookup failed (${error instanceof Error ? error.message.slice(0, 80) : error})`);
      }
    }
    if (!coords && ctx.geo?.lat != null && ctx.geo.lng != null) coords = { lat: ctx.geo.lat, lng: ctx.geo.lng };
    if (!coords && countries[0] && centroids.has(countries[0])) {
      const c = centroids.get(countries[0])!;
      coords = { lat: c[0], lng: c[1] };
      warn(`${name}: no coordinates; using the centroid of ${countries[0]}`);
    }
    if (!coords) {
      skip(item, "no coordinates");
      continue;
    }
    const speakersFromWikidata = claimQuantities(ctx.entity, "P1098")
      .filter((q) => q.year)
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
    const iso = claimStrings(ctx.entity, "P220")[0] ?? /\b[a-z]{3}\b/.exec(infoboxField(ctx.rows, /^iso 639-3$/i) ?? "")?.[0];
    const scripts = writingSystems(infoboxField(ctx.rows, /^writing system$/i));
    const sources: SeedSource[] = [wikipediaSource(ctx.page, today)];
    if (ctx.page.qid) sources.push(wikidataSource(ctx.page.qid));
    if (glottocode) sources.push({ citation: `Glottolog, languoid ${glottocode}`, url: `https://glottolog.org/resource/languoid/id/${glottocode}`, kind: "dataset" });
    const elp = claimStrings(ctx.entity, "P2192")[0];
    if (elp) sources.push({ citation: "Endangered Languages Project", url: `https://www.endangeredlanguages.com/lang/${elp}`, kind: "website" });
    languages.push({
      slug,
      name,
      endonym: claimStrings(ctx.entity, "P1705").find((e) => e !== name),
      iso6393: iso,
      family:
        languageFamily(infoboxField(ctx.rows, /^language family$/i)) ??
        claimIds(ctx.entity, "P279")
          .map((id) => label(labels.get(id))?.replace(/\s+languages?$/i, ""))
          .find((l): l is string => Boolean(l) && !/^(?:language|natural language|modern language)$/i.test(l!)) ??
        "",
      status,
      statusSource,
      speakersNote:
        speakersNote(nativeSpeakers) ??
        (speakersFromWikidata ? `${speakersFromWikidata.amount.toLocaleString("en-US")} speakers (${speakersFromWikidata.year}, via Wikidata)` : undefined),
      writingSystems: scripts.length ? scripts : claimIds(ctx.entity, "P282").map((id) => label(labels.get(id))).filter((s): s is string => Boolean(s)).slice(0, 3),
      countries,
      lat: Number(coords.lat.toFixed(4)),
      lng: Number(coords.lng.toFixed(4)),
      description: description(ctx, 1100),
      aliases: aliasesOf(ctx, name),
      sources,
    });
    languageSlugs.add(slug);
  }

  /* ---------------------------------------------------------------- species */
  const speciesList: SeedSpecies[] = [];
  const speciesSlugs = new Set(options.existing.speciesSlugs);
  for (const item of manifest.filter((i): i is SpeciesItem => i.type === "species")) {
    if (!itemPages.has(item)) continue;
    const ctx = context(item);
    const slug = item.slug ?? slugify(item.name ?? item.wiki);
    if (speciesSlugs.has(slug)) {
      skip(item, `species “${slug}” already exists`);
      continue;
    }
    // Prefer the binomial when Wikidata's taxon is the (monotypic) genus, e.g. Wollemia → Wollemia nobilis.
    const taxon = claimStrings(ctx.entity, "P225")[0];
    const binomial = cleanInline(infoboxField(ctx.rows, /^binomial name$/i) ?? infoboxSection(ctx.rows, /^binomial name$/i, 1) ?? "")
      .replace(/[()]/g, " ")
      .split(/\s+/)
      .filter((w) => /^[A-Z]?[a-z]+$/.test(w))
      .slice(0, 2)
      .join(" ");
    const scientificName = taxon && (taxon.includes(" ") || !binomial.startsWith(`${taxon} `)) ? taxon : binomial || taxon || "";
    const fromBox = iucnFromInfobox(ctx.rows);
    const wikidataStatus = claimIds(ctx.entity, "P141").map((id) => label(labels.get(id))).find(Boolean);
    let iucnStatus: IucnStatus | undefined = fromBox?.status;
    let assessmentNote = fromBox ? `IUCN Red List: ${fromBox.text} (as shown on Wikipedia)` : "";
    if (!iucnStatus && wikidataStatus) {
      iucnStatus = iucnStatusFrom(wikidataStatus);
      assessmentNote = `IUCN Red List: ${capitalize(wikidataStatus)} (via Wikidata)`;
    }
    const statusSection = infoboxField(ctx.rows, /^conservation status$/i) ?? ctx.rows.map((r) => r.cells.join(" ")).find((t) => /^extinct\s*\(?\d{4}/i.test(t));
    if (!iucnStatus && statusSection && /^extinct/i.test(cleanInline(statusSection))) {
      iucnStatus = "EX";
      assessmentNote = `Extinct: ${cleanInline(statusSection)} (Wikipedia; no IUCN category shown)`;
    }
    if (!iucnStatus || !scientificName) {
      skip(item, !iucnStatus ? "no conservation status in the sources" : "no scientific name");
      continue;
    }
    const taxonGroup = item.group ?? taxonGroupFrom(ctx.rows) ?? taxonGroupFromDescription(ctx.page.description);
    if (!taxonGroup) {
      skip(item, "taxon group not found in the taxobox");
      continue;
    }
    const countries = unique([...(item.countries ?? []), ...isoCodes(ctx.entity, ["P183"])]).filter(isCountryCode).slice(0, 8);
    const coords = coordinatesOf(item, ctx, countries, true);
    if (!coords) {
      skip(item, "no location");
      continue;
    }
    const sources: SeedSource[] = [wikipediaSource(ctx.page, today)];
    if (ctx.page.qid) sources.push(wikidataSource(ctx.page.qid));
    if (claimStrings(ctx.entity, "P627").length) {
      sources.push({ citation: "IUCN Red List of Threatened Species", url: `https://www.iucnredlist.org/search?query=${encodeURIComponent(scientificName)}&searchType=species`, kind: "registry" });
    }
    const commonName = item.name ?? stripDisambiguation(ctx.page.title);
    speciesList.push({
      slug,
      commonName,
      scientificName,
      iucnStatus,
      assessmentNote,
      taxonGroup,
      habitat: "",
      countries,
      lat: Number(coords.lat.toFixed(4)),
      lng: Number(coords.lng.toFixed(4)),
      description: description(ctx, 1100),
      aliases: aliasesOf(ctx, commonName),
      sources,
    });
    speciesSlugs.add(slug);
  }

  /* ---------------------------------------------------------------- ecosystems */
  const ecosystemsList: SeedEcosystem[] = [];
  const ecosystemSlugs = new Set(options.existing.ecosystemSlugs);
  for (const item of manifest.filter((i): i is EcosystemItem => i.type === "ecosystem")) {
    if (!itemPages.has(item)) continue;
    const ctx = context(item);
    const slug = item.slug ?? slugify(item.name ?? item.wiki);
    if (ecosystemSlugs.has(slug)) {
      skip(item, `ecosystem “${slug}” already exists`);
      continue;
    }
    const countries = countriesOf(item, ctx, ["P17"]);
    const coords = coordinatesOf(item, ctx, countries, true);
    if (!coords) {
      skip(item, "no location");
      continue;
    }
    const source = wikipediaSource(ctx.page, today);
    const observations: SeedObservation[] = datedObservations(ctx.prose, { max: 6, currentYear }).map((o) => ({
      year: o.year,
      yearEnd: o.yearEnd,
      title: o.title,
      observation: o.observation,
      source,
      reliability: "medium",
    }));
    const { tags, years } = designationsOf(ctx.entity);
    const statusParts = tags.map((t) => (years[t] ? `${capitalize(t)} (${years[t]})` : capitalize(t)));
    if (observations.length) statusParts.push(`Documented change since ${observations[0].year}`);
    const sources: SeedSource[] = [source];
    if (ctx.page.qid) sources.push(wikidataSource(ctx.page.qid));
    const name = item.name ?? stripDisambiguation(ctx.page.title);
    ecosystemsList.push({
      slug,
      name,
      kind: item.kind,
      countries,
      lat: Number(coords.lat.toFixed(4)),
      lng: Number(coords.lng.toFixed(4)),
      description: description(ctx, 1200),
      statusNote: statusParts.join(" · ") || "Status not assessed in the sources",
      aliases: aliasesOf(ctx, name),
      sources,
      observations,
    });
    ecosystemSlugs.add(slug);
  }

  /* ---------------------------------------------------------------- knowledge-graph entities */
  const entityBySlug = new Map<string, SeedEntity>();
  const curatedByName = new Map<string, string>();
  for (const e of options.existing.entities) {
    curatedByName.set(e.slug, e.slug);
    curatedByName.set(slugify(e.name), e.slug);
    for (const a of e.aliases ?? []) curatedByName.set(slugify(a), e.slug);
  }
  const slugForQid = new Map<string, string>();
  const entityFor = (qid: string, typeHint?: EntityType): string | undefined => {
    if (slugForQid.has(qid)) return slugForQid.get(qid);
    const target = labels.get(qid);
    const name = label(target);
    if (!name || /^Q\d+$/.test(name) || IGNORED_ENTITY_LABELS.test(name)) return undefined;
    const base = slugify(name);
    if (!base) return undefined;
    const curated = curatedByName.get(base);
    if (curated) {
      slugForQid.set(qid, curated);
      return curated;
    }
    const info = classes.get(qid);
    let type: EntityType = typeHint ?? "concept";
    if (/^list of\b/i.test(name)) type = "concept";
    else if (!typeHint) {
      if (info?.classes.includes(PERSON_CLASS)) type = "person";
      else if (info?.classes.some((c) => ORGANIZATION_CLASSES.has(c))) type = "organization";
      else if (info?.classes.some((c) => EVENT_CLASSES.has(c))) type = "event";
      else if (/\b(?:road|route|trail|way)s?\b/i.test(name)) type = "route";
      else if (/\b(?:empire|dynasty|kingdom|caliphate|civili[sz]ation|culture|sultanate|khanate|people)\b/i.test(name)) type = "civilization";
      else if (info?.lat != null) type = "place";
    }
    let slug = base;
    const clash = entityBySlug.get(slug);
    if (clash && clash.name !== name) slug = `${base}-${qid.toLowerCase()}`;
    if (!entityBySlug.has(slug)) {
      entityBySlug.set(slug, {
        slug,
        type,
        name,
        description: capitalize(target?.descriptions?.en?.value),
        aliases: [label(target, "ru")].filter((a): a is string => Boolean(a) && a !== name),
        lat: type === "place" || type === "region" ? info?.lat : undefined,
        lng: type === "place" || type === "region" ? info?.lng : undefined,
      });
    }
    slugForQid.set(qid, slug);
    return slug;
  };

  /* ---------------------------------------------------------------- records */
  const records: SeedRecord[] = [];
  const recordSlugs = new Set(options.existing.recordSlugs);
  for (const item of manifest.filter((i): i is RecordItem => i.type === "record")) {
    if (!itemPages.has(item)) continue;
    const ctx = context(item);
    const slug = item.slug ?? slugify(item.wiki);
    if (recordSlugs.has(slug)) {
      skip(item, `record “${slug}” already exists`);
      continue;
    }
    const continuation = continuationAfterLead(ctx.prose, ctx.lead);
    const { summary, body } = summaryAndBody(ctx.lead, continuation.length ? continuation : ctx.prose.slice(0, 4));
    if (summary.length < 40 || body.length < 80) {
      skip(item, "lead text too short to make a record");
      continue;
    }
    const countries = countriesOf(item, ctx);
    const coords = coordinatesOf(item, ctx, countries, true);
    if (coords?.how === "country") warn(`${item.wiki}: placed at the centroid of ${countries[0]}`);

    /* Period and date label */
    const first = (props: string[]): WikidataYear | undefined => props.map((p) => claimYears(ctx.entity, p)[0]).find(Boolean);
    let start: WikidataYear | undefined;
    let end: WikidataYear | undefined;
    if (item.kind === "event") {
      start = first(["P585", "P580", "P571"]);
      end = first(["P582"]) ?? start;
    } else if (item.kind === "story") {
      // People and individual animals: lifetime; otherwise the period the story covers.
      start = first(["P569", "P571", "P580"]);
      end = first(["P570", "P582", "P576"]);
    } else if (item.kind === "document" || item.kind === "artifact") {
      start = first(["P571", "P577", "P580"]);
      end = first(["P582", "P576"]) ?? start;
    } else if (item.dimension !== "natural" || item.kind !== "site") {
      start = first(["P571", "P580"]);
      end = first(["P582", "P576", "P2669"]);
    }
    if (start && end && end.year < start.year) end = start;
    // Only living traditions are assumed to continue to the present. Anything else without a sourced
    // end date is shown from its start only, so the archive never claims "– present" unsourced.
    const ongoing = Boolean(start && !end && (item.kind === "tradition" || item.kind === "practice"));
    const periodStart = start?.year;
    const periodEnd = end?.year ?? (ongoing ? currentYear : periodStart);

    const { tags: designationTags, years: designationYears } = designationsOf(ctx.entity);
    const dateParts: string[] = [];
    if (item.kind === "tradition" || item.kind === "practice") dateParts.push("Living tradition");
    if (start) {
      if (end && end.year !== start.year) dateParts.push(`${formatYear(start)} – ${formatYear(end)}`);
      else if (ongoing) dateParts.push(`${formatYear(start)} – present`);
      else if (!end && item.kind !== "event") dateParts.push(`From ${formatYear(start)}`);
      else dateParts.push(formatYear(start));
    }
    const unescoYear = designationYears["intangible heritage"] ?? designationYears["urgent safeguarding"];
    if (unescoYear) dateParts.push(`UNESCO list ${unescoYear}`);
    if (designationYears["world heritage"]) dateParts.push(`World Heritage ${designationYears["world heritage"]}`);

    /* Place name */
    const placeLabel =
      (ctx.geo ? stripDisambiguation(ctx.geo.title) : undefined) ??
      ["P276", "P131", "P706", "P206"].map((p) => claimIds(ctx.entity, p)[0]).map((id) => (id ? label(labels.get(id)) : undefined)).find(Boolean);
    const primaryCountry = countries[0] ? countryName(countries[0], "en") : undefined;
    const placeName =
      coords?.how === "approximate"
        ? `${stripDisambiguation(ctx.page.title)} (approximate centre)`
        : [placeLabel, primaryCountry].filter((p, i, all) => p && (i === 0 || !all[0]?.includes(p))).join(", ") || undefined;

    /* Graph entities */
    const entitySlugs: string[] = [];
    const selfQid = ctx.page.qid;
    for (const { prop, type, max } of ENTITY_PROPERTIES) {
      if (entitySlugs.length >= MAX_ENTITIES_PER_RECORD) break;
      for (const qid of claimIds(ctx.entity, prop).slice(0, max ?? 2)) {
        if (entitySlugs.length >= MAX_ENTITIES_PER_RECORD) break;
        if (qid === selfQid || isoByQid.has(qid)) continue;
        const entitySlug = entityFor(qid, type);
        if (entitySlug && !entitySlugs.includes(entitySlug)) entitySlugs.push(entitySlug);
      }
    }

    /* Links to Living Earth and Languages */
    const link = (slug: string | undefined, known: Set<string>, what: string) => {
      if (!slug) return undefined;
      if (known.has(slug)) return slug;
      warn(`${item.wiki}: ${what} “${slug}” is not in the dataset; link dropped`);
      return undefined;
    };

    const sources: SeedSource[] = [wikipediaSource(ctx.page, today)];
    if (ctx.page.qid) sources.push(wikidataSource(ctx.page.qid));
    const whc = claimStrings(ctx.entity, "P757")[0];
    if (whc) sources.push({ citation: "UNESCO World Heritage List", url: `https://whc.unesco.org/en/list/${whc.replace(/[^\d]/g, "")}/`, kind: "registry" });

    const title = item.title ?? ctx.page.title;
    records.push({
      slug,
      title,
      summary,
      body,
      dimension: item.dimension,
      kind: item.kind,
      country: countries[0],
      countries,
      placeName,
      lat: coords ? Number(coords.lat.toFixed(4)) : undefined,
      lng: coords ? Number(coords.lng.toFixed(4)) : undefined,
      periodStart,
      periodEnd: periodStart != null ? periodEnd : undefined,
      dateLabel: dateParts.join("; ") || undefined,
      tags: unique([...(item.tags ?? []), ...designationTags].map((t) => t.toLowerCase())).slice(0, 8),
      aliases: aliasesOf(ctx, title),
      origin: "reference",
      license: "CC-BY-SA-4.0",
      language: link(item.language, languageSlugs, "language"),
      species: link(item.species, speciesSlugs, "species"),
      ecosystem: link(item.ecosystem, ecosystemSlugs, "ecosystem"),
      entities: entitySlugs,
      sources,
      attribution: `Text from the Wikipedia article “${ctx.page.title}” by Wikipedia contributors (CC BY-SA 4.0), read with Jina Reader on ${today}; structured facts from Wikidata${ctx.page.qid ? ` ${ctx.page.qid}` : ""} (CC0). Imported automatically and pending expert verification.`,
    });
    recordSlugs.add(slug);
  }

  const usedEntities = new Set(records.flatMap((r) => r.entities));
  const entities = [...entityBySlug.values()].filter((e) => usedEntities.has(e.slug));
  report.imported = { records: records.length, languages: languages.length, species: speciesList.length, ecosystems: ecosystemsList.length, entities: entities.length };
  return {
    dataset: {
      generatedAt: new Date().toISOString(),
      generator: IMPORT_GENERATOR,
      notice:
        "Text is taken from English Wikipedia (CC BY-SA 4.0) and structured facts from Wikidata (CC0), selected automatically without generative AI. Every item is pending expert verification.",
      records,
      languages,
      species: speciesList,
      ecosystems: ecosystemsList,
      entities,
    },
    report,
  };
}
