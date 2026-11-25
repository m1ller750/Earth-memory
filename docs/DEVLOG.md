# EARTH MEMORY: Development log

Newest entries first. Each entry records what was built, what was tested and what is still open.

## 2026-11-24 (later): English default, Grok key, reference-data importer

**Requested:** English as the default language; fill every memory dimension (Natural Memory had no
records) using Jina AI's MCP server for web parsing; use the supplied Grok key.

**Done**
- The interface is English for everyone unless the visitor picks Russian with the switcher; the
  browser's Accept-Language is ignored (`src/lib/i18n/server.ts`). Verified: a browser sending
  `Accept-Language: ru` gets `<html lang="en">`; the `em_locale=ru` cookie still gives Russian.
- Jina's MCP server is registered for Claude Code at user scope (`claude mcp add -s user --transport http jina https://mcp.jina.ai/v1`).
  `JINA_API_KEY` is not set on this machine, so it was added without the Authorization header
  (keyless access works, with lower rate limits). An empty or unexpanded `${JINA_API_KEY}` header
  was tested and rejected by Jina (HTTP 401), so it was left out on purpose.
- New importer (`src/lib/ingest/*`, `npm run ingest`, `npm run db:import`; see ARCHITECTURE §4a).
  It reads each Wikipedia article in the manifest through Jina's `read_url` MCP tool, takes lead text
  and coordinates from the Wikipedia API and facts from Wikidata, and writes
  `src/lib/db/seed/imported.json`. No generative AI: text is selected and cleaned, never written.
  Items that cannot be sourced (no status, no location) are skipped and reported.
- `npm run db:import` adds only new slugs, so it is safe on a database with user contributions; the
  seed also loads the imported data for new databases.

**Imported** (277 articles, all parsed through Jina's MCP server; nothing skipped in the final run)
- 198 archive records: Natural 42 (the dimension had none), Cultural 48, Historical 42, Scientific 35,
  Human 31 (it had only four fictional demos); 27 languages (14 critically endangered, 3 extinct);
  32 species (15 extinct, 4 extinct in the wild, 12 critically endangered); 20 ecosystems with 53
  dated observations; 249 knowledge-graph entities.
- The dev database after `db:import`: 256 records, 50 languages, 51 species, 30 ecosystems; 120 new
  Connection Engine proposals queued for expert review; every record has a location. A backup was
  taken first (`backups/`).

**Review fixes before loading:** manifest titles that led to disambiguation pages or broader
redirects (now detected and skipped automatically), pronunciation leftovers in leads
("Mariachi (US:, UK:, Spanish:)"), "– present" end dates that no source supports (now only living
traditions continue to the present), noisy observations (census counts, plans, citation years,
"the tsetse fly retreated" as ice retreat), genus names instead of binomials, a CR species read as
EW, diaspora countries on languages, and slugs that mangled "ł" and apostrophes.

**Tested**
- `tsc` clean; Vitest 47/47 (new: 15 importer parsing tests on real Jina/Wikipedia shapes, and
  database tests that a second import adds nothing and that every imported record carries its
  Wikipedia licence and source).
- `npm run smoke`: every page and API check passes; 489 internal links crawled (was 176).
- In the browser: Natural archive lists 42 records; the Okjökull page shows the lead, CC BY-SA
  licence, Wikipedia and Wikidata sources and Connection Engine links (Laki, Chacaltaya); the Dead
  Sea shows its dated observations and a High Memory Alert; Memory Alert lists 195 subjects; the
  globe shows 386 points.

**Open**
- Grok needs the key's provider endpoint (`XAI_BASE_URL`) or a key from console.x.ai.
- Imported text is English only; the Russian interface shows it untranslated.
- No photographs were imported (Wikimedia Commons images would need per-image licence and author
  display, and a schema change for externally hosted media).

**Grok key:** api.x.ai rejects the supplied key ("Incorrect API key"). It starts with `sk-`, while
xAI keys start with `xai-`, so it is probably from an OpenAI-compatible reseller. It is kept,
commented out, in the git-ignored `.env.local` until the provider's endpoint is known
(`XAI_BASE_URL`); EARTH AI stays in retrieval-only mode meanwhile.

## 2026-11-24: Phases 2–12, platform build-out

**Built**
- Data model (27 tables, `drizzle/0000_init.sql`) and a curated reference dataset: 58 records across five dimensions, 23 languages with lexicons, 19 species, 10 ecosystems with observations, 78 entities, 100 editorial graph edges, 19 conservation projects. Fictional records are labelled *Demo*; reference records cite their public sources and are pending expert verification.
- 3D globe (globe.gl, h3 hex land, offline geometry) with dimension layers, period filter and place pages.
- Archive with full-text + trigram search (diacritics folded), record pages, sources, media with EXIF stripping and magic-byte checks.
- Languages of Earth, Living Earth (species, ecosystems, observation timelines), knowledge graph (d3-force), Timeline explorer.
- Memory Connection Engine (explainable evidence; links stay proposals until an expert accepts), Memory Alert (transparent four-factor score), verification workflow (2 community approvals or an expert decision), reputation from verified work only.
- EARTH AI: EN/RU intent parsing, retrieval with numbered citations, streaming; providers xAI Grok or Claude, otherwise a labelled retrieval-only composer. Only public, non-sensitive records reach a provider.
- Accounts, roles, community-restricted and sacred material, moderation and audit log, API keys with scopes, REST API `/api/v1`, MCP server (7 read tools; 2 write tools only with an API key), Synapse MCP library entry.
- EN/RU interface, dashboard charts with table views, docs, Dockerfile/compose, backup/restore scripts.

**Tested**
- `tsc` clean; Vitest 30/30 (engines + in-memory PostgreSQL integration).
- `npm run smoke`: 28 pages, 15 API checks, 176 crawled internal links pass; a community-restricted record is hidden from anonymous users (404 from the API).
- `npm run mcp:check`: all read tools pass; write tools absent without a key. A live MCP call from Claude Code returned Memory Alert data.
- `next build` succeeds.

**Open / not verified**
- Live LLM generation (Grok and Claude paths) has not been exercised: no key was configured in the environment.
- PostgreSQL via `DATABASE_URL` and the Docker setup are untested here (neither PostgreSQL nor Docker installed).
- Restricted record pages return a soft 404 (HTTP 200 with the not-found UI) because of streaming; the API returns real 404s.
- Connection Engine evidence strings are English-only in the Russian interface.
- Two `next build` warnings about dynamic filesystem tracing (harmless for `next start`).

## 2026-11-23: Phase 1, foundation

**Inspection**
- Empty repository. Node 26.13, npm 11.20, git 2.56. No Python interpreter, Docker or PostgreSQL.
- Synapse CLI 1.19.3 found. MCP library empty; no vault secrets for this folder; no Anthropic credentials.
- npm registry reachable; current releases: Next.js 16.4.6, React 19.3, Tailwind 4.3, PGlite 0.6, Drizzle 0.45, Zod 4.6, Anthropic SDK 1.12, MCP SDK 1.32.

**Decisions** (rationale in [ARCHITECTURE.md](ARCHITECTURE.md))
- TypeScript monolith on Next.js 16 with PostgreSQL via Drizzle; PGlite embedded locally, `DATABASE_URL` for production.
- globe.gl/Three.js globe with offline country geometry; d3 + SVG for charts, graph and timeline.
- First-party session auth with RBAC; consent-aware visibility module shared by UI, API, AI and MCP.
- Claude as the optional AI provider with a fully working retrieval-only fallback.
