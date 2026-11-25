import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ----------------------------------------------------------------------------
 * Enumerations
 * ------------------------------------------------------------------------- */

export const ROLES = ["contributor", "expert", "moderator", "admin"] as const;
export const DIMENSIONS = ["human", "cultural", "historical", "natural", "scientific"] as const;
export const RECORD_KINDS = [
  "photograph",
  "video",
  "audio",
  "document",
  "story",
  "interview",
  "recipe",
  "practice",
  "map",
  "research",
  "observation",
  "site",
  "tradition",
  "event",
  "artifact",
] as const;
export const VISIBILITIES = ["public", "community", "restricted", "private"] as const;
export const SENSITIVITIES = ["none", "culturally_sensitive", "sacred"] as const;
export const VERIFICATIONS = ["unverified", "community_verified", "expert_verified", "disputed"] as const;
export const ORIGINS = ["reference", "demo", "community"] as const;
export const LICENSES = [
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "CC-BY-NC-4.0",
  "CC0-1.0",
  "public-domain",
  "all-rights-reserved",
  "community-protocol",
] as const;
export const LANGUAGE_STATUSES = [
  "safe",
  "vulnerable",
  "definitely_endangered",
  "severely_endangered",
  "critically_endangered",
  "extinct",
] as const;
export const IUCN_STATUSES = ["EX", "EW", "CR", "EN", "VU", "NT", "LC", "DD"] as const;

export const roleEnum = pgEnum("role", ROLES);
export const dimensionEnum = pgEnum("dimension", DIMENSIONS);
export const recordKindEnum = pgEnum("record_kind", RECORD_KINDS);
export const visibilityEnum = pgEnum("visibility", VISIBILITIES);
export const sensitivityEnum = pgEnum("sensitivity", SENSITIVITIES);
export const verificationEnum = pgEnum("verification", VERIFICATIONS);
export const originEnum = pgEnum("origin", ORIGINS);
export const licenseEnum = pgEnum("license", LICENSES);
export const languageStatusEnum = pgEnum("language_status", LANGUAGE_STATUSES);
export const iucnStatusEnum = pgEnum("iucn_status", IUCN_STATUSES);

export type Role = (typeof ROLES)[number];
export type Dimension = (typeof DIMENSIONS)[number];
export type RecordKind = (typeof RECORD_KINDS)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type Sensitivity = (typeof SENSITIVITIES)[number];
export type Verification = (typeof VERIFICATIONS)[number];
export type Origin = (typeof ORIGINS)[number];
export type License = (typeof LICENSES)[number];
export type LanguageStatus = (typeof LANGUAGE_STATUSES)[number];
export type IucnStatus = (typeof IUCN_STATUSES)[number];

/** A single, human-readable reason supporting a knowledge-graph connection. */
export interface EvidenceItem {
  kind: "shared_entity" | "geography" | "period" | "tag" | "language" | "text" | "citation" | "editorial";
  detail: string;
  weight?: number;
}

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const textArray = (name: string) =>
  text(name)
    .array()
    .notNull()
    .default(sql`'{}'::text[]`);

/* ----------------------------------------------------------------------------
 * People, institutions, communities
 * ------------------------------------------------------------------------- */

export const institutions = pgTable("institutions", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // museum | university | archive | library | ngo | research | community
  countryCode: text("country_code"),
  website: text("website"),
  description: text("description").notNull().default(""),
  verified: boolean("verified").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("contributor"),
    bio: text("bio").notNull().default(""),
    affiliation: text("affiliation").notNull().default(""),
    institutionId: uuid("institution_id").references(() => institutions.id, { onDelete: "set null" }),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token; the token itself is never stored. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const communities = pgTable("communities", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  countryCode: text("country_code"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const communityMembers = pgTable(
  "community_members",
  {
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // member | steward
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.communityId, t.userId] })],
);

/* ----------------------------------------------------------------------------
 * Geography
 * ------------------------------------------------------------------------- */

export const countries = pgTable("countries", {
  code: text("code").primaryKey(), // ISO 3166-1 alpha-2
  numeric: text("numeric"),
  name: text("name").notNull(),
  nameRu: text("name_ru").notNull(),
  subregion: text("subregion"),
  continent: text("continent"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
});

/* ----------------------------------------------------------------------------
 * Languages of Earth
 * ------------------------------------------------------------------------- */

export const languages = pgTable(
  "languages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    endonym: text("endonym"),
    iso6393: text("iso639_3"),
    family: text("family").notNull().default(""),
    status: languageStatusEnum("status").notNull(),
    statusSource: text("status_source").notNull().default(""),
    speakersNote: text("speakers_note"),
    writingSystems: textArray("writing_systems"),
    countryCodes: textArray("country_codes"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    description: text("description").notNull().default(""),
    aliases: textArray("aliases"),
    origin: originEnum("origin").notNull().default("community"),
    verification: verificationEnum("verification").notNull().default("unverified"),
    searchText: text("search_text").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("languages_status_idx").on(t.status),
    index("languages_search_idx").using("gin", sql`to_tsvector('simple', ${t.searchText})`),
    index("languages_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
  ],
);

export const lexiconEntries = pgTable(
  "lexicon_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "cascade" }),
    headword: text("headword").notNull(),
    transcription: text("transcription"),
    glossEn: text("gloss_en").notNull(),
    glossRu: text("gloss_ru"),
    partOfSpeech: text("part_of_speech"),
    note: text("note"),
    sourceCitation: text("source_citation").notNull().default(""),
    contributorId: uuid("contributor_id").references(() => users.id, { onDelete: "set null" }),
    origin: originEnum("origin").notNull().default("community"),
    verification: verificationEnum("verification").notNull().default("unverified"),
    createdAt: createdAt(),
  },
  (t) => [index("lexicon_language_idx").on(t.languageId)],
);

/* ----------------------------------------------------------------------------
 * Living Earth
 * ------------------------------------------------------------------------- */

export const species = pgTable(
  "species",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    commonName: text("common_name").notNull(),
    scientificName: text("scientific_name").notNull(),
    iucnStatus: iucnStatusEnum("iucn_status").notNull(),
    assessmentNote: text("assessment_note").notNull().default(""),
    taxonGroup: text("taxon_group").notNull(),
    habitat: text("habitat").notNull().default(""),
    countryCodes: textArray("country_codes"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    description: text("description").notNull().default(""),
    aliases: textArray("aliases"),
    origin: originEnum("origin").notNull().default("community"),
    verification: verificationEnum("verification").notNull().default("unverified"),
    searchText: text("search_text").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("species_status_idx").on(t.iucnStatus),
    index("species_search_idx").using("gin", sql`to_tsvector('simple', ${t.searchText})`),
    index("species_name_trgm_idx").using("gin", t.commonName.op("gin_trgm_ops")),
  ],
);

export const ecosystems = pgTable(
  "ecosystems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // lake | forest | reef | wetland | mangrove | grassland | glacier | desert | ocean
    countryCodes: textArray("country_codes"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    description: text("description").notNull().default(""),
    statusNote: text("status_note").notNull().default(""),
    aliases: textArray("aliases"),
    origin: originEnum("origin").notNull().default("community"),
    verification: verificationEnum("verification").notNull().default("unverified"),
    searchText: text("search_text").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ecosystems_search_idx").using("gin", sql`to_tsvector('simple', ${t.searchText})`),
    index("ecosystems_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
  ],
);

export const ecosystemObservations = pgTable(
  "ecosystem_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ecosystemId: uuid("ecosystem_id")
      .notNull()
      .references(() => ecosystems.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    yearEnd: integer("year_end"),
    title: text("title").notNull(),
    observation: text("observation").notNull(),
    metricName: text("metric_name"),
    metricValue: doublePrecision("metric_value"),
    metricUnit: text("metric_unit"),
    sourceCitation: text("source_citation").notNull(),
    sourceUrl: text("source_url"),
    reliability: text("reliability").notNull().default("medium"), // high | medium | low
    origin: originEnum("origin").notNull().default("community"),
    createdAt: createdAt(),
  },
  (t) => [index("observations_ecosystem_idx").on(t.ecosystemId, t.year)],
);

/* ----------------------------------------------------------------------------
 * The archive
 * ------------------------------------------------------------------------- */

export const records = pgTable(
  "records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    body: text("body").notNull().default(""),
    dimension: dimensionEnum("dimension").notNull(),
    kind: recordKindEnum("kind").notNull(),
    countryCode: text("country_code").references(() => countries.code),
    countryCodes: textArray("country_codes"),
    placeName: text("place_name"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    periodStart: integer("period_start"),
    periodEnd: integer("period_end"),
    dateLabel: text("date_label"),
    contentLanguage: text("content_language").notNull().default("en"),
    tags: textArray("tags"),
    aliases: textArray("aliases"),
    contributorId: uuid("contributor_id").references(() => users.id, { onDelete: "set null" }),
    institutionId: uuid("institution_id").references(() => institutions.id, { onDelete: "set null" }),
    communityId: uuid("community_id").references(() => communities.id, { onDelete: "set null" }),
    languageId: uuid("language_id").references(() => languages.id, { onDelete: "set null" }),
    speciesId: uuid("species_id").references(() => species.id, { onDelete: "set null" }),
    ecosystemId: uuid("ecosystem_id").references(() => ecosystems.id, { onDelete: "set null" }),
    attribution: text("attribution").notNull().default(""),
    license: licenseEnum("license").notNull().default("CC-BY-4.0"),
    visibility: visibilityEnum("visibility").notNull().default("public"),
    sensitivity: sensitivityEnum("sensitivity").notNull().default("none"),
    verification: verificationEnum("verification").notNull().default("unverified"),
    origin: originEnum("origin").notNull().default("community"),
    searchText: text("search_text").notNull().default(""),
    /** Character n-gram fingerprint used by the Memory Connection Engine (see lib/engine/similarity). */
    fingerprint: real("fingerprint").array(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("records_country_idx").on(t.countryCode),
    index("records_dimension_idx").on(t.dimension),
    index("records_kind_idx").on(t.kind),
    index("records_verification_idx").on(t.verification),
    index("records_origin_idx").on(t.origin),
    index("records_period_idx").on(t.periodStart),
    index("records_contributor_idx").on(t.contributorId),
    index("records_country_codes_idx").using("gin", t.countryCodes),
    index("records_tags_idx").using("gin", t.tags),
    index("records_search_idx").using("gin", sql`to_tsvector('simple', ${t.searchText})`),
    index("records_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
  ],
);

export const recordTranslations = pgTable(
  "record_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    languageCode: text("language_code").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    body: text("body").notNull().default(""),
    translatorId: uuid("translator_id").references(() => users.id, { onDelete: "set null" }),
    verification: verificationEnum("verification").notNull().default("unverified"),
    createdAt: createdAt(),
  },
  (t) => [index("translations_record_idx").on(t.recordId)],
);

/** Citations for any subject: record, language, species, ecosystem, entity. */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    citation: text("citation").notNull(),
    url: text("url"),
    kind: text("kind").notNull().default("website"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("sources_subject_idx").on(t.subjectType, t.subjectId)],
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id").references(() => records.id, { onDelete: "cascade" }),
    lexiconEntryId: uuid("lexicon_entry_id").references(() => lexiconEntries.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // image | audio | video | document
    storageKey: text("storage_key").notNull().unique(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    width: integer("width"),
    height: integer("height"),
    originalName: text("original_name").notNull().default(""),
    caption: text("caption").notNull().default(""),
    exif: jsonb("exif").$type<Record<string, unknown>>(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("media_record_idx").on(t.recordId), index("media_sha_idx").on(t.sha256)],
);

/* ----------------------------------------------------------------------------
 * Knowledge graph
 * ------------------------------------------------------------------------- */

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    type: text("type").notNull(), // person | place | route | region | civilization | tradition | concept | organization | language_group | taxon | event
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    aliases: textArray("aliases"),
    countryCodes: textArray("country_codes"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    periodStart: integer("period_start"),
    periodEnd: integer("period_end"),
    origin: originEnum("origin").notNull().default("community"),
    searchText: text("search_text").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("entities_type_idx").on(t.type),
    index("entities_search_idx").using("gin", sql`to_tsvector('simple', ${t.searchText})`),
    index("entities_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
  ],
);

export const recordEntities = pgTable(
  "record_entities",
  {
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("about"),
    provenance: text("provenance").notNull().default("editorial"), // editorial | contributor | ai | engine
    confidence: real("confidence").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.recordId, t.entityId] }), index("record_entities_entity_idx").on(t.entityId)],
);

/**
 * Graph edges between any two nodes. Node types: record, entity, language, species, ecosystem, country.
 * Node ids are uuids except for countries, which use ISO codes.
 */
export const edges = pgTable(
  "edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    relation: text("relation").notNull(),
    evidence: jsonb("evidence")
      .$type<EvidenceItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    provenance: text("provenance").notNull().default("editorial"), // editorial | contributor | engine | ai
    confidence: real("confidence").notNull().default(1),
    uncertainty: text("uncertainty").notNull().default("probable"), // confirmed | probable | speculative
    status: text("status").notNull().default("proposed"), // proposed | accepted | rejected
    citation: text("citation"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("edges_source_idx").on(t.sourceType, t.sourceId),
    index("edges_target_idx").on(t.targetType, t.targetId),
    uniqueIndex("edges_unique_idx").on(t.sourceType, t.sourceId, t.targetType, t.targetId, t.relation),
  ],
);

/* ----------------------------------------------------------------------------
 * Verification, moderation, AI output
 * ------------------------------------------------------------------------- */

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    decision: text("decision").notNull(), // approve | request_changes | dispute
    reviewerRole: text("reviewer_role").notNull(), // community | expert
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reviews_record_reviewer_idx").on(t.recordId, t.reviewerId)],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(), // inaccurate | sensitive | copyright | privacy | abuse | spam
    details: text("details").notNull().default(""),
    status: text("status").notNull().default("open"), // open | resolved | dismissed
    resolutionNote: text("resolution_note"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("reports_status_idx").on(t.status)],
);

/** AI output is stored apart from confirmed fields and only applied after human review. */
export const aiAnnotations = pgTable(
  "ai_annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id"),
    kind: text("kind").notNull(), // metadata_suggestion | translation | image_analysis | summary
    targetLanguage: text("target_language"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    model: text("model").notNull(),
    status: text("status").notNull().default("suggested"), // suggested | accepted | rejected
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [index("ai_annotations_subject_idx").on(t.subjectType, t.subjectId)],
);

/* ----------------------------------------------------------------------------
 * Collections and preservation initiatives
 * ------------------------------------------------------------------------- */

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  institutionId: uuid("institution_id").references(() => institutions.id, { onDelete: "set null" }),
  visibility: text("visibility").notNull().default("public"), // public | private
  collaborative: boolean("collaborative").notNull().default(false),
  createdAt: createdAt(),
});

export const collectionItems = pgTable(
  "collection_items",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.recordId] })],
);

export const collectionMembers = pgTable(
  "collection_members",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("editor"), // owner | editor
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.userId] })],
);

export const conservationProjects = pgTable("conservation_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  organization: text("organization").notNull().default(""),
  url: text("url"),
  focus: text("focus").notNull(), // language | species | ecosystem | heritage | archive
  countryCodes: textArray("country_codes"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("active"), // active | completed | unknown
  startYear: integer("start_year"),
  origin: originEnum("origin").notNull().default("reference"),
  createdAt: createdAt(),
});

/* ----------------------------------------------------------------------------
 * Agent access and auditing
 * ------------------------------------------------------------------------- */

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: textArray("scopes"),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("api_keys_hash_idx").on(t.keyHash), index("api_keys_user_idx").on(t.userId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorType: text("actor_type").notNull(), // user | api_key | system
    actorId: text("actor_id"),
    action: text("action").notNull(),
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_subject_idx").on(t.subjectType, t.subjectId)],
);

export type RecordRow = typeof records.$inferSelect;
export type NewRecordRow = typeof records.$inferInsert;
export type LanguageRow = typeof languages.$inferSelect;
export type SpeciesRow = typeof species.$inferSelect;
export type EcosystemRow = typeof ecosystems.$inferSelect;
export type EntityRow = typeof entities.$inferSelect;
export type EdgeRow = typeof edges.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type ObservationRow = typeof ecosystemObservations.$inferSelect;
export type ProjectRow = typeof conservationProjects.$inferSelect;
