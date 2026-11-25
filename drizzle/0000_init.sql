CREATE TYPE "public"."dimension" AS ENUM('human', 'cultural', 'historical', 'natural', 'scientific');--> statement-breakpoint
CREATE TYPE "public"."iucn_status" AS ENUM('EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD');--> statement-breakpoint
CREATE TYPE "public"."language_status" AS ENUM('safe', 'vulnerable', 'definitely_endangered', 'severely_endangered', 'critically_endangered', 'extinct');--> statement-breakpoint
CREATE TYPE "public"."license" AS ENUM('CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC0-1.0', 'public-domain', 'all-rights-reserved', 'community-protocol');--> statement-breakpoint
CREATE TYPE "public"."origin" AS ENUM('reference', 'demo', 'community');--> statement-breakpoint
CREATE TYPE "public"."record_kind" AS ENUM('photograph', 'video', 'audio', 'document', 'story', 'interview', 'recipe', 'practice', 'map', 'research', 'observation', 'site', 'tradition', 'event', 'artifact');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('contributor', 'expert', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."sensitivity" AS ENUM('none', 'culturally_sensitive', 'sacred');--> statement-breakpoint
CREATE TYPE "public"."verification" AS ENUM('unverified', 'community_verified', 'expert_verified', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'community', 'restricted', 'private');--> statement-breakpoint
CREATE TABLE "ai_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid,
	"kind" text NOT NULL,
	"target_language" text,
	"content" jsonb NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"created_by" uuid,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_items" (
	"collection_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"added_by" uuid,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_items_collection_id_record_id_pk" PRIMARY KEY("collection_id","record_id")
);
--> statement-breakpoint
CREATE TABLE "collection_members" (
	"collection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	CONSTRAINT "collection_members_collection_id_user_id_pk" PRIMARY KEY("collection_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"owner_id" uuid,
	"institution_id" uuid,
	"visibility" text DEFAULT 'public' NOT NULL,
	"collaborative" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "communities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"country_code" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "community_members" (
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_members_community_id_user_id_pk" PRIMARY KEY("community_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conservation_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"organization" text DEFAULT '' NOT NULL,
	"url" text,
	"focus" text NOT NULL,
	"country_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_year" integer,
	"origin" "origin" DEFAULT 'reference' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conservation_projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"code" text PRIMARY KEY NOT NULL,
	"numeric" text,
	"name" text NOT NULL,
	"name_ru" text NOT NULL,
	"subregion" text,
	"continent" text,
	"lat" double precision,
	"lng" double precision
);
--> statement-breakpoint
CREATE TABLE "ecosystem_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ecosystem_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"year_end" integer,
	"title" text NOT NULL,
	"observation" text NOT NULL,
	"metric_name" text,
	"metric_value" double precision,
	"metric_unit" text,
	"source_citation" text NOT NULL,
	"source_url" text,
	"reliability" text DEFAULT 'medium' NOT NULL,
	"origin" "origin" DEFAULT 'community' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecosystems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"country_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"description" text DEFAULT '' NOT NULL,
	"status_note" text DEFAULT '' NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"origin" "origin" DEFAULT 'community' NOT NULL,
	"verification" "verification" DEFAULT 'unverified' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ecosystems_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"relation" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provenance" text DEFAULT 'editorial' NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"uncertainty" text DEFAULT 'probable' NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"citation" text,
	"created_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"country_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"period_start" integer,
	"period_end" integer,
	"origin" "origin" DEFAULT 'community' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"country_code" text,
	"website" text,
	"description" text DEFAULT '' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"endonym" text,
	"iso639_3" text,
	"family" text DEFAULT '' NOT NULL,
	"status" "language_status" NOT NULL,
	"status_source" text DEFAULT '' NOT NULL,
	"speakers_note" text,
	"writing_systems" text[] DEFAULT '{}'::text[] NOT NULL,
	"country_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"origin" "origin" DEFAULT 'community' NOT NULL,
	"verification" "verification" DEFAULT 'unverified' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "languages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "lexicon_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"headword" text NOT NULL,
	"transcription" text,
	"gloss_en" text NOT NULL,
	"gloss_ru" text,
	"part_of_speech" text,
	"note" text,
	"source_citation" text DEFAULT '' NOT NULL,
	"contributor_id" uuid,
	"origin" "origin" DEFAULT 'community' NOT NULL,
	"verification" "verification" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid,
	"lexicon_entry_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"original_name" text DEFAULT '' NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"exif" jsonb,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "record_entities" (
	"record_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"role" text DEFAULT 'about' NOT NULL,
	"provenance" text DEFAULT 'editorial' NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	CONSTRAINT "record_entities_record_id_entity_id_pk" PRIMARY KEY("record_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "record_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"language_code" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"translator_id" uuid,
	"verification" "verification" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"dimension" "dimension" NOT NULL,
	"kind" "record_kind" NOT NULL,
	"country_code" text,
	"country_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"place_name" text,
	"lat" double precision,
	"lng" double precision,
	"period_start" integer,
	"period_end" integer,
	"date_label" text,
	"content_language" text DEFAULT 'en' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"contributor_id" uuid,
	"institution_id" uuid,
	"community_id" uuid,
	"language_id" uuid,
	"species_id" uuid,
	"ecosystem_id" uuid,
	"attribution" text DEFAULT '' NOT NULL,
	"license" "license" DEFAULT 'CC-BY-4.0' NOT NULL,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"sensitivity" "sensitivity" DEFAULT 'none' NOT NULL,
	"verification" "verification" DEFAULT 'unverified' NOT NULL,
	"origin" "origin" DEFAULT 'community' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"fingerprint" real[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "records_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"reporter_id" uuid,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reviewer_role" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"citation" text NOT NULL,
	"url" text,
	"kind" text DEFAULT 'website' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "species" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"common_name" text NOT NULL,
	"scientific_name" text NOT NULL,
	"iucn_status" "iucn_status" NOT NULL,
	"assessment_note" text DEFAULT '' NOT NULL,
	"taxon_group" text NOT NULL,
	"habitat" text DEFAULT '' NOT NULL,
	"country_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"origin" "origin" DEFAULT 'community' NOT NULL,
	"verification" "verification" DEFAULT 'unverified' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "species_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'contributor' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"affiliation" text DEFAULT '' NOT NULL,
	"institution_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_annotations" ADD CONSTRAINT "ai_annotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_annotations" ADD CONSTRAINT "ai_annotations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_members" ADD CONSTRAINT "collection_members_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_members" ADD CONSTRAINT "collection_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem_observations" ADD CONSTRAINT "ecosystem_observations_ecosystem_id_ecosystems_id_fk" FOREIGN KEY ("ecosystem_id") REFERENCES "public"."ecosystems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexicon_entries" ADD CONSTRAINT "lexicon_entries_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexicon_entries" ADD CONSTRAINT "lexicon_entries_contributor_id_users_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_lexicon_entry_id_lexicon_entries_id_fk" FOREIGN KEY ("lexicon_entry_id") REFERENCES "public"."lexicon_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_entities" ADD CONSTRAINT "record_entities_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_entities" ADD CONSTRAINT "record_entities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_translations" ADD CONSTRAINT "record_translations_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_translations" ADD CONSTRAINT "record_translations_translator_id_users_id_fk" FOREIGN KEY ("translator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_contributor_id_users_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_ecosystem_id_ecosystems_id_fk" FOREIGN KEY ("ecosystem_id") REFERENCES "public"."ecosystems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_annotations_subject_idx" ON "ai_annotations" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_subject_idx" ON "audit_log" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "observations_ecosystem_idx" ON "ecosystem_observations" USING btree ("ecosystem_id","year");--> statement-breakpoint
CREATE INDEX "ecosystems_search_idx" ON "ecosystems" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "ecosystems_name_trgm_idx" ON "ecosystems" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "edges_source_idx" ON "edges" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "edges_target_idx" ON "edges" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "edges_unique_idx" ON "edges" USING btree ("source_type","source_id","target_type","target_id","relation");--> statement-breakpoint
CREATE INDEX "entities_type_idx" ON "entities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "entities_search_idx" ON "entities" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "entities_name_trgm_idx" ON "entities" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "languages_status_idx" ON "languages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "languages_search_idx" ON "languages" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "languages_name_trgm_idx" ON "languages" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "lexicon_language_idx" ON "lexicon_entries" USING btree ("language_id");--> statement-breakpoint
CREATE INDEX "media_record_idx" ON "media" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "media_sha_idx" ON "media" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "record_entities_entity_idx" ON "record_entities" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "translations_record_idx" ON "record_translations" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "records_country_idx" ON "records" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "records_dimension_idx" ON "records" USING btree ("dimension");--> statement-breakpoint
CREATE INDEX "records_kind_idx" ON "records" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "records_verification_idx" ON "records" USING btree ("verification");--> statement-breakpoint
CREATE INDEX "records_origin_idx" ON "records" USING btree ("origin");--> statement-breakpoint
CREATE INDEX "records_period_idx" ON "records" USING btree ("period_start");--> statement-breakpoint
CREATE INDEX "records_contributor_idx" ON "records" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "records_country_codes_idx" ON "records" USING gin ("country_codes");--> statement-breakpoint
CREATE INDEX "records_tags_idx" ON "records" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "records_search_idx" ON "records" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "records_title_trgm_idx" ON "records" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_record_reviewer_idx" ON "reviews" USING btree ("record_id","reviewer_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sources_subject_idx" ON "sources" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "species_status_idx" ON "species" USING btree ("iucn_status");--> statement-breakpoint
CREATE INDEX "species_search_idx" ON "species" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "species_name_trgm_idx" ON "species" USING gin ("common_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");