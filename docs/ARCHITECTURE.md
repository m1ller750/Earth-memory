# EARTH MEMORY: Architecture

Status: v0.1 (foundation). This document is the architecture proposal requested by the master prompt (§13, §17 Phase 1). It is kept current as the build proceeds; the running history of decisions lives in [DEVLOG.md](DEVLOG.md).

## 1. What the inspection found (2026-11-23)

| Item | Finding | Consequence |
|---|---|---|
| Repository | Empty folder, no existing code | Greenfield build; no legacy stack to respect |
| Runtime | Node.js 26.13, npm 11.20, git 2.56 | TypeScript end to end |
| Python | Only the Windows Store stub (no interpreter) | No Python backend |
| Docker / PostgreSQL | Neither installed | Local database must be embedded |
| Synapse CLI | 1.19.3: memory, vault-scoped secrets, MCP library (`mcp add/install/run`), `synapse run --` | Used for secrets injection, project memory and MCP registration (see §9) |
| AI credentials | No `ANTHROPIC_API_KEY`, no vault secret for this folder | AI features ship with a labeled, fully working fallback mode |
| Machine | 8 cores, 7.8 GB RAM, Windows 10 Home | Keep the dev footprint small; one process |

## 2. Stack

| Concern | Choice | Reason |
|---|---|---|
| Web application | Next.js 16 (App Router), React 19, TypeScript | One deployable; server components read the database directly; route handlers form the public API |
| Styling | Tailwind CSS 4 with project design tokens | Requested; tokens keep the identity consistent |
| Database | PostgreSQL through Drizzle ORM | Requested. Locally: **PGlite** (PostgreSQL compiled to WebAssembly, embedded in the Node process, persisted to `data/pglite`). In production: any PostgreSQL 15+ through `DATABASE_URL` (node-postgres). Same schema, same migrations, same SQL |
| Search | PostgreSQL full-text search (`simple` configuration, so it works for every language and script), trigram fuzzy matching, multilingual alias fields, knowledge-graph expansion; Claude query expansion when configured | Real database search with no fake "semantic" claims |
| Geography | Latitude/longitude columns with bounding-box and haversine SQL | Portable across PGlite and PostgreSQL; PostGIS is the documented scaling path |
| 3D globe | globe.gl (Three.js) with Natural Earth country shapes from `world-atlas` | Works offline, needs no third-party imagery or tokens, and gives a distinctive data-globe look |
| Charts, graph, timeline | d3 (scale, shape, force) rendered to SVG by React | Full control over the visual identity and accessibility |
| Authentication | First-party session auth: scrypt password hashes (Node `crypto`), random session tokens stored only as SHA-256 hashes, httpOnly SameSite cookies, a single RBAC policy module | Small, auditable, testable |
| AI | xAI Grok (OpenAI-compatible API, `XAI_API_KEY`, optional `XAI_BASE_URL`) or Anthropic Claude (`claude-opus-5-5`, `ANTHROPIC_API_KEY`) when a key is configured; deterministic retrieval-only mode otherwise | Requested; honest degradation |
| Reference data | Importer that parses Wikipedia articles with Jina Reader (MCP) and adds Wikidata facts; no generative AI | Real, attributable content at scale (see §4a) |
| Files | Storage adapter writing to `data/uploads` (S3-compatible adapter is the production path); type checked by magic bytes, size-capped, served with `nosniff` | Secure uploads without new infrastructure |
| Agent access | MCP server (`@modelcontextprotocol/sdk`, stdio) that calls the public REST API with scoped API keys | Requested (§14); one enforcement point for permissions |
| Tests | Vitest (unit tests plus database integration tests on an in-memory PGlite) and an HTTP smoke crawler | Every phase is tested |

Deliberately **not** used: a separate backend service, a separate vector database, Redis, a message queue, GraphQL. None is needed at this scale, and the prompt asks not to add technology for show.

## 3. Module map

```
src/
  app/                    Routes (pages, route handlers, server actions)
    api/v1/...            Public REST API (used by the UI, MCP server and integrators)
  components/             UI: design system, globe, graph, timeline, charts
  lib/
    db/                   Drizzle schema, client (PGlite or PostgreSQL), migrations, seed
    auth/                 Passwords, sessions, RBAC policy
    access/               Visibility rules for consent-controlled content (single source of truth)
    search/               Query parsing, full-text and alias search, region vocabulary
    engine/               Memory Connection Engine, Memory Alert, reputation, similarity
    ai/                   Grok/Claude clients, assistant (RAG), metadata suggestions, translation
    ingest/               Reference-data importer: manifest, Jina Reader (MCP) client, Wikipedia/Wikidata
                          clients, deterministic parsing and assembly (see §4a)
    storage/              File storage adapter and file-type sniffing
    i18n/                 English and Russian UI dictionaries
    validation/           Zod schemas shared by forms, API and MCP
  server/                 Data-access functions used by pages and the API
mcp/                      MCP server exposing Earth Memory tools to agents
scripts/                  migrate, seed, reset, backup, restore, smoke test
tests/                    Vitest suites
drizzle/                  Generated SQL migrations
```

## 4a. Reference-data importer

`npm run ingest` fills the archive from public sources without generative AI, so nothing in the
imported data is invented:

1. **Manifest** (`src/lib/ingest/manifest.ts`): the curator's list of Wikipedia articles, each with
   its dimension, record kind, tags and, where an item has no coordinates of its own, the article
   whose place represents it (`geoFrom`).
2. **Wikipedia API**: lead text, coordinates and the Wikidata id of every article (batched).
3. **Jina Reader through Jina's MCP server** (`read_url` on `https://mcp.jina.ai/v1`): parses each
   article into markdown; the importer reads the infobox (conservation status, UNESCO language
   status, speakers, family, scripts, coordinates) and the article prose (for record bodies and the
   dated observations of ecosystems).
4. **Wikidata** (API and SPARQL): countries, dates, UNESCO designations with inscription years,
   IUCN and UNESCO statuses, and the people, places and concepts that become knowledge-graph entities.
5. **Assembly** (`src/lib/ingest/build.ts`): selects and cleans text (summary = opening sentences,
   body = the rest of the lead, extended with following paragraphs when short), validates every
   field and skips items it cannot source. The output, `src/lib/db/seed/imported.json`, is
   committed so the dataset can be reviewed and reseeded offline.
6. **Loading** (`npm run db:import`, also run by the seed): inserts only items that are not in the
   database yet and lets the Connection Engine propose links involving the new records.

All responses are cached in `data/ingest/cache`, so re-runs are fast and reproducible. Text is
adapted from Wikipedia under CC BY-SA 4.0 (records carry that licence and an attribution line);
Wikidata facts are CC0. Every imported item is `reference` provenance and pending expert review.

## 4. Data model (summary)

- **records**: the archive. Title, summary, body, five *dimensions* (human, cultural, historical, natural, scientific), kind (photograph, story, tradition, site, event, …), country and coordinates, period (`period_start`/`period_end` as signed years, negative for BCE), content language, tags and multilingual aliases, contributor/institution/community, licence, **visibility** (public, community, restricted, private), **sensitivity** (none, culturally sensitive, sacred), **verification** (unverified, community verified, expert verified, disputed), **origin** (reference, demo, community).
- **sources**: citations attached to any subject (record, language, species, ecosystem, entity).
- **media**: uploaded files with SHA-256 (exact-duplicate detection), dimensions, EXIF.
- **languages** and **lexicon_entries**: language profiles (UNESCO vitality category with its source), vocabulary, pronunciation audio.
- **species**, **ecosystems**, **ecosystem_observations**: Living Earth, with source, date and reliability for every observation.
- **entities** and **edges**: the knowledge graph. Every edge carries evidence, provenance (editorial, contributor, engine, AI), confidence, an uncertainty label (confirmed, probable, speculative) and a review status.
- **users**, **sessions**, **institutions**, **communities** (+ members and stewards), **collections**.
- **reviews**, **reports**, **ai_annotations** (AI output stored apart from confirmed fields), **record_translations** (human translations).
- **conservation_projects**, **api_keys**, **audit_log**.

## 5. The three original mechanisms

1. **Memory Connection Engine.** For any record it scores candidate links from explainable signals: shared knowledge-graph entities, geographic distance, overlap of historical periods, shared tags, shared language, and lexical similarity (character n-gram fingerprints). Each proposed link lists its evidence and gets an uncertainty label. Engine links stay *proposed* until an expert accepts or rejects them, and the decision is recorded.
2. **Memory Alert.** A transparent preservation-priority indicator per subject (language, tradition, archive, ecosystem, species). Factors: documented threat category from a named source (UNESCO, IUCN, UNESCO Urgent Safeguarding List), documentation gap inside Earth Memory, single-source risk, verification gap. The page shows every factor value, what is missing, the documentation that exists, recommended actions, relevant organizations, and a confidence level with limitations. It is explicitly *not* an extinction prediction.
3. **Earth Memory Timeline.** A zoomable time axis from prehistory to today, with lanes for the five dimensions, linked to the globe and filters, plus per-ecosystem transformation timelines with period comparison.

## 6. Trust model

- **Consent first.** Visibility is enforced in one data-access module (`lib/access`) that every page, API route, AI retrieval and MCP tool goes through. Restricted and sacred material is never sent to the AI model or exposed over MCP.
- **AI is labeled, never silently merged.** AI suggestions, translations and analyses live in `ai_annotations` with model name and status; a human must accept them before they touch confirmed fields, and the UI marks them as AI interpretation everywhere.
- **Provenance on everything.** Each record, connection and observation shows where it came from. Seed content is labeled *reference (compiled from public sources, pending expert verification)*; fictional examples are labeled *demo*.
- **Honest numbers.** Dashboards show only live database counts, split by origin, so seed data is never presented as community achievement.

## 7. Security

scrypt password hashing; session tokens stored hashed; httpOnly + SameSite cookies, `Secure` in production; origin checks on mutations (server actions and route handlers); RBAC (`contributor`, `expert`, `moderator`, `admin` plus community stewards); Zod validation on every input; upload type sniffing, size caps, randomized storage keys, files served through an access-checked route; per-IP rate limits on auth, write and AI endpoints; security headers (CSP, frame denial, referrer and permissions policies); audit log for every write; scoped, revocable, hashed API keys for agents.

## 8. Technical risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | PGlite allows one process per data directory; parallel build workers or two servers could corrupt it | Lazy connection (no database access at import time), a lock file that refuses a second process, every database-backed route rendered at request time; production uses PostgreSQL |
| 2 | Next.js 16.4 is newer than the team's prior experience (Cache Components, partial prefetching, Turbopack-only Tailwind) | Read the guides bundled in `node_modules/next/dist/docs` before writing each kind of code; stay on documented APIs |
| 3 | No AI credentials on this machine | Retrieval-only assistant and rule-based helpers work without a key; the Claude path is implemented from the SDK docs and reported as untested until a key is supplied |
| 4 | Content authenticity | Seed data is limited to well-documented public facts, cited by source name, labeled AI-compiled and unverified; no invented vocabulary, statistics, measurements or photographs |
| 5 | WebGL globe performance on weak or mobile devices | Capped point counts, coarse land hexes, reduced-motion support, pause when hidden, a list-based alternative view |
| 6 | Leakage of sensitive cultural knowledge | Single visibility module with integration tests; restricted content excluded from search snippets, AI and MCP |
| 7 | Malicious uploads | Allow-list by magic bytes, size limits, no server-side execution, `Content-Disposition` and `nosniff` on delivery |
| 8 | Speech-to-text has no provider here | Manual transcripts plus browser dictation where supported; provider interface documented, not claimed |
| 9 | Single-node assumptions (in-memory rate limits, local files) | Adapters documented for Redis and S3-compatible storage when scaling out |
| 10 | Licensing of contributed material | Licence and consent are required fields; community protocol licence option; reports for copyright |

## 9. Synapse CLI and MCP

- **Secrets:** `synapse run -- npm run dev` injects vault variables (for example `ANTHROPIC_API_KEY`) into the process, so keys never live in `.env` files or the repository.
- **Memory:** durable project decisions are stored in Synapse project memory, not in ad hoc notes.
- **MCP:** the Earth Memory MCP server (`mcp/server.ts`) can be described in the Synapse library with `synapse mcp add` and handed to connected tools with `synapse mcp install`. Synapse is a development and integration aid; the production application does not depend on it.
