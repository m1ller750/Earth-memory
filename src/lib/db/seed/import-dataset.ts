/**
 * Loads an imported dataset into a database incrementally: only items whose slug is not present yet
 * are inserted, so it is safe to run against a database that already holds user contributions.
 * Afterwards the Memory Connection Engine proposes links involving the new records (as
 * "proposed" edges for expert review, never as confirmed facts).
 */
import { eq, inArray } from "drizzle-orm";
import { buildEngineContext, discoverAll, type EngineRecord } from "../../engine/connections";
import { fingerprint, recordFingerprintText } from "../../engine/similarity";
import { countryName } from "../../geo/countries";
import { buildSearchText } from "../../text";
import type { Database } from "../client";
import * as s from "../schema";
import { REFERENCE_ATTRIBUTION, type ImportedDataset, type SeedSource } from "./types";

export interface ImportResult {
  records: number;
  languages: number;
  species: number;
  ecosystems: number;
  entities: number;
  proposals: number;
}

export interface ImportOptions {
  log?: (message: string) => void;
  /** Maximum number of new Connection Engine proposals to store. */
  proposalLimit?: number;
}

const placeNames = (codes: string[]) => [codes.map((c) => countryName(c, "en")), codes.map((c) => countryName(c, "ru"))];

export async function importDataset(db: Database, data: ImportedDataset, options: ImportOptions = {}): Promise<ImportResult> {
  const log = options.log ?? (() => {});
  const result: ImportResult = { records: 0, languages: 0, species: 0, ecosystems: 0, entities: 0, proposals: 0 };
  if (!data.records.length && !data.languages.length && !data.species.length && !data.ecosystems.length) return result;

  await db.transaction(async (tx) => {
    const slugs = async (table: typeof s.records | typeof s.languages | typeof s.species | typeof s.ecosystems | typeof s.entities) =>
      new Map((await tx.select({ slug: table.slug, id: table.id }).from(table)).map((r) => [r.slug, r.id]));
    const languageIds = await slugs(s.languages);
    const speciesIds = await slugs(s.species);
    const ecosystemIds = await slugs(s.ecosystems);
    const entityIds = await slugs(s.entities);
    const recordIds = await slugs(s.records);

    const addSources = async (subjectType: string, subjectId: string, list: SeedSource[]) => {
      if (list.length) await tx.insert(s.sources).values(list.map((src) => ({ subjectType, subjectId, citation: src.citation, url: src.url ?? null, kind: src.kind })));
    };

    for (const l of data.languages) {
      if (languageIds.has(l.slug)) continue;
      const [row] = await tx
        .insert(s.languages)
        .values({
          slug: l.slug,
          name: l.name,
          endonym: l.endonym ?? null,
          iso6393: l.iso6393 ?? null,
          family: l.family,
          status: l.status,
          statusSource: l.statusSource,
          speakersNote: l.speakersNote ?? null,
          writingSystems: l.writingSystems,
          countryCodes: l.countries,
          lat: l.lat,
          lng: l.lng,
          description: l.description,
          aliases: l.aliases,
          origin: "reference",
          searchText: buildSearchText(l.name, l.endonym, l.aliases, l.family, l.description, ...placeNames(l.countries)),
        })
        .returning({ id: s.languages.id });
      languageIds.set(l.slug, row.id);
      await addSources("language", row.id, l.sources);
      result.languages++;
    }

    for (const sp of data.species) {
      if (speciesIds.has(sp.slug)) continue;
      const [row] = await tx
        .insert(s.species)
        .values({
          slug: sp.slug,
          commonName: sp.commonName,
          scientificName: sp.scientificName,
          iucnStatus: sp.iucnStatus,
          assessmentNote: sp.assessmentNote,
          taxonGroup: sp.taxonGroup,
          habitat: sp.habitat,
          countryCodes: sp.countries,
          lat: sp.lat,
          lng: sp.lng,
          description: sp.description,
          aliases: sp.aliases,
          origin: "reference",
          searchText: buildSearchText(sp.commonName, sp.scientificName, sp.aliases, sp.habitat, sp.description, ...placeNames(sp.countries)),
        })
        .returning({ id: s.species.id });
      speciesIds.set(sp.slug, row.id);
      await addSources("species", row.id, sp.sources);
      result.species++;
    }

    for (const e of data.ecosystems) {
      if (ecosystemIds.has(e.slug)) continue;
      const [row] = await tx
        .insert(s.ecosystems)
        .values({
          slug: e.slug,
          name: e.name,
          kind: e.kind,
          countryCodes: e.countries,
          lat: e.lat,
          lng: e.lng,
          description: e.description,
          statusNote: e.statusNote,
          aliases: e.aliases,
          origin: "reference",
          searchText: buildSearchText(e.name, e.aliases, e.kind, e.description, ...placeNames(e.countries)),
        })
        .returning({ id: s.ecosystems.id });
      ecosystemIds.set(e.slug, row.id);
      await addSources("ecosystem", row.id, e.sources);
      if (e.observations.length) {
        await tx.insert(s.ecosystemObservations).values(
          e.observations.map((o) => ({
            ecosystemId: row.id,
            year: o.year,
            yearEnd: o.yearEnd ?? null,
            title: o.title,
            observation: o.observation,
            metricName: o.metric?.name ?? null,
            metricValue: o.metric?.value ?? null,
            metricUnit: o.metric?.unit ?? null,
            sourceCitation: o.source.citation,
            sourceUrl: o.source.url ?? null,
            reliability: o.reliability,
            origin: "reference" as const,
          })),
        );
      }
      result.ecosystems++;
    }

    const newEntities = data.entities.filter((e) => !entityIds.has(e.slug));
    if (newEntities.length) {
      const rows = await tx
        .insert(s.entities)
        .values(
          newEntities.map((e) => ({
            slug: e.slug,
            type: e.type,
            name: e.name,
            description: e.description,
            aliases: e.aliases ?? [],
            countryCodes: e.countries ?? [],
            lat: e.lat ?? null,
            lng: e.lng ?? null,
            periodStart: e.periodStart ?? null,
            periodEnd: e.periodEnd ?? null,
            origin: "reference" as const,
            searchText: buildSearchText(e.name, e.aliases ?? [], e.description),
          })),
        )
        .returning({ id: s.entities.id, slug: s.entities.slug });
      for (const r of rows) entityIds.set(r.slug, r.id);
      result.entities = rows.length;
    }

    const newRecordIds: string[] = [];
    for (const r of data.records) {
      if (recordIds.has(r.slug)) continue;
      const countriesList = r.countries ?? (r.country ? [r.country] : []);
      const [row] = await tx
        .insert(s.records)
        .values({
          slug: r.slug,
          title: r.title,
          summary: r.summary,
          body: r.body,
          dimension: r.dimension,
          kind: r.kind,
          countryCode: r.country ?? null,
          countryCodes: countriesList,
          placeName: r.placeName ?? null,
          lat: r.lat ?? null,
          lng: r.lng ?? null,
          periodStart: r.periodStart ?? null,
          periodEnd: r.periodEnd ?? null,
          dateLabel: r.dateLabel ?? null,
          contentLanguage: "en",
          tags: r.tags,
          aliases: r.aliases ?? [],
          languageId: r.language ? (languageIds.get(r.language) ?? null) : null,
          speciesId: r.species ? (speciesIds.get(r.species) ?? null) : null,
          ecosystemId: r.ecosystem ? (ecosystemIds.get(r.ecosystem) ?? null) : null,
          attribution: r.attribution ?? REFERENCE_ATTRIBUTION,
          license: r.license ?? "CC-BY-SA-4.0",
          visibility: r.visibility ?? "public",
          sensitivity: r.sensitivity ?? "none",
          verification: "unverified",
          origin: r.origin,
          searchText: buildSearchText(r.title, r.summary, r.body, r.tags, r.aliases ?? [], r.placeName, ...placeNames(countriesList)),
          fingerprint: fingerprint(recordFingerprintText(r)),
        })
        .returning({ id: s.records.id });
      recordIds.set(r.slug, row.id);
      newRecordIds.push(row.id);
      await addSources("record", row.id, r.sources);
      const linked = r.entities.map((slug) => entityIds.get(slug)).filter((id): id is string => Boolean(id));
      if (linked.length) {
        await tx.insert(s.recordEntities).values(linked.map((entityId) => ({ recordId: row.id, entityId, role: "about", provenance: "editorial" })));
      }
      result.records++;
    }

    /* Memory Connection Engine: proposals that involve at least one newly imported record. */
    if (newRecordIds.length) {
      const rows = await tx
        .select({
          id: s.records.id,
          slug: s.records.slug,
          title: s.records.title,
          dimension: s.records.dimension,
          countryCode: s.records.countryCode,
          countryCodes: s.records.countryCodes,
          lat: s.records.lat,
          lng: s.records.lng,
          periodStart: s.records.periodStart,
          periodEnd: s.records.periodEnd,
          tags: s.records.tags,
          languageId: s.records.languageId,
          ecosystemId: s.records.ecosystemId,
          speciesId: s.records.speciesId,
          fingerprint: s.records.fingerprint,
        })
        .from(s.records)
        .where(eq(s.records.visibility, "public"));
      const links = await tx
        .select({ recordId: s.recordEntities.recordId, entityId: s.recordEntities.entityId })
        .from(s.recordEntities)
        .where(inArray(s.recordEntities.recordId, rows.map((r) => r.id)));
      const byRecord = new Map<string, string[]>();
      for (const l of links) byRecord.set(l.recordId, [...(byRecord.get(l.recordId) ?? []), l.entityId]);
      const engineRecords: EngineRecord[] = rows.map((r) => ({ ...r, entityIds: byRecord.get(r.id) ?? [], fingerprint: r.fingerprint ?? null }));

      const [entityRows, languageRows, ecosystemRows, speciesRows] = await Promise.all([
        tx.select({ id: s.entities.id, name: s.entities.name }).from(s.entities),
        tx.select({ id: s.languages.id, name: s.languages.name }).from(s.languages),
        tx.select({ id: s.ecosystems.id, name: s.ecosystems.name }).from(s.ecosystems),
        tx.select({ id: s.species.id, name: s.species.commonName }).from(s.species),
      ]);
      const subjectNames = new Map<string, string>([
        ...languageRows.map((l) => [l.id, `the ${l.name} language`] as [string, string]),
        ...ecosystemRows.map((e) => [e.id, `the ${e.name}`] as [string, string]),
        ...speciesRows.map((x) => [x.id, `the ${x.name}`] as [string, string]),
      ]);
      const context = buildEngineContext(engineRecords, new Map(entityRows.map((e) => [e.id, e.name])), subjectNames);

      const existingEdges = await tx.select({ a: s.edges.sourceId, b: s.edges.targetId }).from(s.edges).where(eq(s.edges.sourceType, "record"));
      const linkedPairs = new Set(existingEdges.flatMap((e) => [`${e.a}|${e.b}`, `${e.b}|${e.a}`]));
      const fresh = new Set(newRecordIds);
      const limit = options.proposalLimit ?? 120;
      const discoveries = discoverAll(engineRecords, context, limit * 4)
        .filter((d) => (fresh.has(d.sourceId) || fresh.has(d.targetId)) && !linkedPairs.has(`${d.sourceId}|${d.targetId}`))
        .slice(0, limit);
      if (discoveries.length) {
        await tx.insert(s.edges).values(
          discoveries.map((d) => ({
            sourceType: "record",
            sourceId: d.sourceId,
            targetType: "record",
            targetId: d.targetId,
            relation: "possibly_related",
            evidence: d.evidence,
            provenance: "engine",
            confidence: d.score,
            uncertainty: d.uncertainty,
            status: "proposed",
          })),
        );
      }
      result.proposals = discoveries.length;
    }

    await tx.insert(s.auditLog).values({ actorType: "system", action: "import", details: { generator: data.generator, generatedAt: data.generatedAt, ...result } });
  });

  log(
    `Imported ${result.records} records, ${result.languages} languages, ${result.species} species, ${result.ecosystems} ecosystems and ${result.entities} entities; ${result.proposals} new engine proposals.`,
  );
  return result;
}
