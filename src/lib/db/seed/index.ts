import { eq, sql } from "drizzle-orm";
import { hashPassword } from "../../auth/password";
import { buildEngineContext, discoverAll, type EngineRecord } from "../../engine/connections";
import { fingerprint, recordFingerprintText } from "../../engine/similarity";
import { loadCountryCentroids } from "../../geo/centroids";
import { continentOf, subregionOf } from "../../geo/regions";
import { allCountryCodes, countryName } from "../../geo/countries";
import { buildSearchText } from "../../text";
import type { Database } from "../client";
import * as s from "../schema";
import { EDGES, ENTITIES, PROJECTS } from "./graph";
import { importDataset } from "./import-dataset";
import { IMPORTED } from "./imported";
import { LANGUAGES, LEXICON } from "./languages";
import { ECOSYSTEMS, SPECIES } from "./living-earth";
import { RECORDS } from "./records";
import { DEMO_ATTRIBUTION, REFERENCE_ATTRIBUTION, type SeedSource } from "./types";

export interface SeedOptions {
  log?: (message: string) => void;
  /** Create the demo accounts (defaults to true outside production, or when DEMO_PASSWORD is set). */
  demoAccounts?: boolean;
}

/** Password for demo accounts in local development. Override with DEMO_PASSWORD. */
export const DEFAULT_DEMO_PASSWORD = "earth-memory-demo";

export const DEMO_ACCOUNTS = [
  { email: "admin@earthmemory.local", name: "Demo Administrator", role: "admin" as const, bio: "Demo account for administration and moderation." },
  { email: "moderator@earthmemory.local", name: "Demo Moderator", role: "moderator" as const, bio: "Demo account for handling reports." },
  { email: "expert@earthmemory.local", name: "Demo Expert Reviewer", role: "expert" as const, bio: "Demo account with expert review rights (fictional historian).", affiliation: "Demo University Linguistics Lab" },
  { email: "steward@earthmemory.local", name: "Demo Community Steward", role: "contributor" as const, bio: "Demo steward of the fictional Demo Highland Community." },
  { email: "contributor@earthmemory.local", name: "Demo Contributor", role: "contributor" as const, bio: "Demo account for adding memories." },
];

const CONFIDENCE = { confirmed: 0.95, probable: 0.7, speculative: 0.4 } as const;

export async function seedDatabase(db: Database, options: SeedOptions = {}) {
  const log = options.log ?? (() => {});
  const isProduction = process.env.NODE_ENV === "production";
  const demoAccounts = options.demoAccounts ?? (!isProduction || Boolean(process.env.DEMO_PASSWORD));
  const started = Date.now();
  log("Seeding reference dataвЂ¦");

  await db.transaction(async (tx) => {
    /* Countries */
    const centroids = loadCountryCentroids();
    const countryRows = allCountryCodes().map((code) => ({
      code,
      numeric: null as string | null,
      name: countryName(code, "en"),
      nameRu: countryName(code, "ru"),
      subregion: subregionOf(code),
      continent: continentOf(code),
      lat: centroids.get(code)?.[0] ?? null,
      lng: centroids.get(code)?.[1] ?? null,
    }));
    await tx.insert(s.countries).values(countryRows).onConflictDoNothing();

    /* Demo institution, community and accounts */
    const [institution] = await tx
      .insert(s.institutions)
      .values({
        slug: "demo-university-linguistics-lab",
        name: "Demo University Linguistics Lab (fictional)",
        kind: "university",
        countryCode: "KG",
        description: "A fictional institution used to demonstrate institution profiles and collections.",
        isDemo: true,
      })
      .returning();
    const [community] = await tx
      .insert(s.communities)
      .values({
        slug: "demo-highland-community",
        name: "Demo Highland Community (fictional)",
        countryCode: "KG",
        description: "A fictional community used to demonstrate community-controlled access to sensitive records.",
        isDemo: true,
      })
      .returning();

    const userIds = new Map<string, string>();
    if (demoAccounts) {
      const passwordHash = await hashPassword(process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD);
      const inserted = await tx
        .insert(s.users)
        .values(
          DEMO_ACCOUNTS.map((a) => ({
            email: a.email,
            name: a.name,
            role: a.role,
            bio: a.bio,
            affiliation: a.affiliation ?? "",
            institutionId: a.role === "expert" ? institution.id : null,
            passwordHash,
            isDemo: true,
          })),
        )
        .returning({ id: s.users.id, email: s.users.email });
      for (const u of inserted) userIds.set(u.email, u.id);
      const steward = userIds.get("steward@earthmemory.local");
      if (steward) await tx.insert(s.communityMembers).values({ communityId: community.id, userId: steward, role: "steward" });
    }

    const addSources = async (subjectType: string, subjectId: string, list: SeedSource[]) => {
      if (list.length === 0) return;
      await tx.insert(s.sources).values(list.map((src) => ({ subjectType, subjectId, citation: src.citation, url: src.url ?? null, kind: src.kind })));
    };

    /* Languages and lexicon */
    const languageIds = new Map<string, string>();
    const subjectNames = new Map<string, string>();
    for (const l of LANGUAGES) {
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
          searchText: buildSearchText(l.name, l.endonym, l.aliases, l.family, l.description, l.countries.map((c) => countryName(c, "en")), l.countries.map((c) => countryName(c, "ru"))),
        })
        .returning({ id: s.languages.id });
      languageIds.set(l.slug, row.id);
      subjectNames.set(row.id, `the ${l.name} language`);
      await addSources("language", row.id, l.sources);
    }
    await tx.insert(s.lexiconEntries).values(
      LEXICON.map((e) => ({
        languageId: languageIds.get(e.language)!,
        headword: e.headword,
        glossEn: e.glossEn,
        glossRu: e.glossRu ?? null,
        partOfSpeech: e.partOfSpeech ?? null,
        note: e.note ?? null,
        sourceCitation: e.source,
        origin: "reference" as const,
      })),
    );

    /* Living Earth */
    const speciesIds = new Map<string, string>();
    for (const sp of SPECIES) {
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
          searchText: buildSearchText(sp.commonName, sp.scientificName, sp.aliases, sp.habitat, sp.description, sp.countries.map((c) => countryName(c, "en")), sp.countries.map((c) => countryName(c, "ru"))),
        })
        .returning({ id: s.species.id });
      speciesIds.set(sp.slug, row.id);
      subjectNames.set(row.id, `the ${sp.commonName}`);
      await addSources("species", row.id, sp.sources);
    }

    const ecosystemIds = new Map<string, string>();
    for (const e of ECOSYSTEMS) {
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
          searchText: buildSearchText(e.name, e.aliases, e.kind, e.description, e.countries.map((c) => countryName(c, "en")), e.countries.map((c) => countryName(c, "ru"))),
        })
        .returning({ id: s.ecosystems.id });
      ecosystemIds.set(e.slug, row.id);
      subjectNames.set(row.id, `the ${e.name}`);
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
    }

    /* Knowledge graph entities */
    const entityIds = new Map<string, string>();
    const entityNames = new Map<string, string>();
    const entityRows = await tx
      .insert(s.entities)
      .values(
        ENTITIES.map((e) => ({
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
      .returning({ id: s.entities.id, slug: s.entities.slug, name: s.entities.name });
    for (const e of entityRows) {
      entityIds.set(e.slug, e.id);
      entityNames.set(e.id, e.name);
    }

    /* Archive records */
    const recordIds = new Map<string, string>();
    const engineRecords: EngineRecord[] = [];
    for (const r of RECORDS) {
      const countriesList = r.countries ?? (r.country ? [r.country] : []);
      const fp = fingerprint(recordFingerprintText(r));
      const isDemo = r.origin === "demo";
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
          contributorId: r.contributor ? (userIds.get(r.contributor) ?? null) : null,
          communityId: r.community === "demo-highland-community" ? community.id : null,
          institutionId: null,
          languageId: r.language ? languageIds.get(r.language)! : null,
          speciesId: r.species ? speciesIds.get(r.species)! : null,
          ecosystemId: r.ecosystem ? ecosystemIds.get(r.ecosystem)! : null,
          attribution: isDemo ? DEMO_ATTRIBUTION : REFERENCE_ATTRIBUTION,
          license: r.license ?? "CC-BY-4.0",
          visibility: r.visibility ?? "public",
          sensitivity: r.sensitivity ?? "none",
          verification: "unverified",
          origin: r.origin,
          searchText: buildSearchText(r.title, r.summary, r.body, r.tags, r.aliases ?? [], r.placeName, countriesList.map((c) => countryName(c, "en")), countriesList.map((c) => countryName(c, "ru"))),
          fingerprint: fp,
        })
        .returning({ id: s.records.id });
      recordIds.set(r.slug, row.id);
      await addSources("record", row.id, r.sources);

      const linked = r.entities.map((slug) => {
        const id = entityIds.get(slug);
        if (!id) throw new Error(`Seed record ${r.slug} references unknown entity ${slug}`);
        return id;
      });
      if (linked.length) {
        await tx.insert(s.recordEntities).values(linked.map((entityId) => ({ recordId: row.id, entityId, role: "about", provenance: "editorial" })));
      }
      if ((r.visibility ?? "public") === "public") {
        engineRecords.push({
          id: row.id,
          slug: r.slug,
          title: r.title,
          dimension: r.dimension,
          countryCode: r.country ?? null,
          countryCodes: countriesList,
          lat: r.lat ?? null,
          lng: r.lng ?? null,
          periodStart: r.periodStart ?? null,
          periodEnd: r.periodEnd ?? null,
          tags: r.tags,
          languageId: r.language ? languageIds.get(r.language)! : null,
          ecosystemId: r.ecosystem ? ecosystemIds.get(r.ecosystem)! : null,
          speciesId: r.species ? speciesIds.get(r.species)! : null,
          entityIds: linked,
          fingerprint: fp,
        });
      }
    }

    /* Editorial knowledge-graph edges */
    const resolve = (ref: string): { type: string; id: string } => {
      const [type, key] = ref.split(":");
      const maps: Record<string, Map<string, string>> = { entity: entityIds, language: languageIds, species: speciesIds, ecosystem: ecosystemIds, record: recordIds };
      if (type === "country") return { type, id: key };
      const id = maps[type]?.get(key);
      if (!id) throw new Error(`Unknown graph node ${ref}`);
      return { type, id };
    };
    await tx.insert(s.edges).values(
      EDGES.map((e) => {
        const source = resolve(e.source);
        const target = resolve(e.target);
        return {
          sourceType: source.type,
          sourceId: source.id,
          targetType: target.type,
          targetId: target.id,
          relation: e.relation,
          evidence: e.evidence.map((detail) => ({ kind: "editorial" as const, detail })),
          provenance: "editorial",
          confidence: CONFIDENCE[e.uncertainty],
          uncertainty: e.uncertainty,
          status: "accepted",
          citation: e.citation ?? null,
        };
      }),
    );

    /* Engine discoveries: proposals awaiting expert review */
    const context = buildEngineContext(engineRecords, entityNames, subjectNames);
    const editorialPairs = new Set(
      EDGES.filter((e) => e.source.startsWith("record:") && e.target.startsWith("record:")).flatMap((e) => {
        const a = resolve(e.source).id;
        const b = resolve(e.target).id;
        return [`${a}|${b}`, `${b}|${a}`];
      }),
    );
    const discoveries = discoverAll(engineRecords, context, 36).filter((d) => !editorialPairs.has(`${d.sourceId}|${d.targetId}`));
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

    /* Preservation initiatives */
    await tx.insert(s.conservationProjects).values(
      PROJECTS.map((p) => ({
        slug: p.slug,
        name: p.name,
        organization: p.organization,
        url: p.url ?? null,
        focus: p.focus,
        countryCodes: p.countries,
        lat: p.lat,
        lng: p.lng,
        description: p.description,
        status: p.status,
        startYear: p.startYear ?? null,
        origin: "reference" as const,
      })),
    );

    /* A demo collection */
    const owner = userIds.get("expert@earthmemory.local") ?? null;
    const [collection] = await tx
      .insert(s.collections)
      .values({
        slug: "sogdian-memory",
        title: "Sogdian memory: from Silk Road merchants to Yaghnobi",
        description: "A collaborative collection tracing the Sogdian language and culture from the Silk Road to the present day.",
        ownerId: owner,
        institutionId: institution.id,
        collaborative: true,
      })
      .returning();
    const collectionSlugs = ["afrasiyab-ambassadors-murals", "ancient-penjikent", "silk-roads-zarafshan-karakum", "yaghnob-valley-resettlement", "mogao-caves-library-cave"];
    await tx.insert(s.collectionItems).values(collectionSlugs.map((slug) => ({ collectionId: collection.id, recordId: recordIds.get(slug)!, addedBy: owner })));
    if (owner) await tx.insert(s.collectionMembers).values({ collectionId: collection.id, userId: owner, role: "owner" });

    await tx.insert(s.auditLog).values({
      actorType: "system",
      action: "seed",
      details: { records: RECORDS.length, languages: LANGUAGES.length, species: SPECIES.length, ecosystems: ECOSYSTEMS.length, discoveries: discoveries.length },
    });
    log(`Seeded ${RECORDS.length} records, ${LANGUAGES.length} languages, ${SPECIES.length} species, ${ECOSYSTEMS.length} ecosystems, ${ENTITIES.length} entities, ${EDGES.length} editorial links and ${discoveries.length} engine proposals.`);
  });

  /* Reference data imported from Wikipedia and Wikidata (npm run ingest). */
  if (IMPORTED.generatedAt) await importDataset(db, IMPORTED, { log });

  log(`Seed finished in ${Date.now() - started} ms.`);
}

/** Removes every row (used by the reset script and tests). */
export async function clearDatabase(db: Database) {
  await db.execute(sql`
    truncate table audit_log, api_keys, conservation_projects, collection_members, collection_items, collections,
      ai_annotations, reports, reviews, edges, record_entities, entities, media, sources, record_translations,
      records, ecosystem_observations, ecosystems, species, lexicon_entries, languages, countries,
      community_members, communities, sessions, users, institutions restart identity cascade`);
}

export async function isSeeded(db: Database): Promise<boolean> {
  const rows = await db.select({ id: s.records.id }).from(s.records).where(eq(s.records.origin, "reference")).limit(1);
  return rows.length > 0;
}
