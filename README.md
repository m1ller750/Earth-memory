# EARTH MEMORY

**A living digital memory of humanity and planet Earth.** *Preserve what makes our world unique before it disappears.*

Earth Memory is a consent-first archive that connects five dimensions of memory (human, cultural, historical, natural and scientific) through an interactive 3D globe, a knowledge graph with evidence on every link, and three original mechanisms:

| Mechanism | What it does |
|---|---|
| **Memory Connection Engine** | Finds links between records from explainable signals (shared entities, distance, overlapping periods, themes, wording) and shows every piece of evidence. Links stay proposals until an expert accepts them. |
| **Memory Alert** | A transparent preservation-priority score for languages, traditions, archives, ecosystems and species: documented threat + documentation gap + single-source risk + verification gap. Not an extinction prediction. |
| **Earth Memory Timeline** | A zoomable time axis from the 4th millennium BCE to today, with lanes for each dimension and documented ecosystem change, linked to the globe. |

## Quick start

Requirements: Node.js 20.9 or newer (developed on Node 26). No database server, Docker or API key is needed.

```powershell
npm install
npm run dev
```

Open http://localhost:3000. On first request the embedded PostgreSQL (PGlite) database in `data/pglite` is migrated and seeded automatically.

Demo accounts for each role (admin, moderator, expert, community steward, contributor) are listed in [docs/DEMO-ACCOUNTS.md](docs/DEMO-ACCOUNTS.md).

## Reference data

The archive ships with two reference datasets, loaded automatically into a new database:

- a small curated set (`src/lib/db/seed/*.ts`) written for the prototype, plus four fictional *Demo* records;
- an imported set (`src/lib/db/seed/imported.json`) built by **`npm run ingest`**, which reads the
  Wikipedia articles listed in `src/lib/ingest/manifest.ts` with **Jina Reader through Jina's MCP server**
  and adds structured facts from Wikidata. No generative AI is involved, so no text or number is invented.

To grow the archive, add articles to the manifest, run `npm run ingest`, review the diff of
`imported.json`, then load the new items into an existing database with `npm run db:import`
(stop the dev server first when using the embedded database). `JINA_API_KEY` is optional and only
raises Jina's rate limits. Details: [docs/ARCHITECTURE.md §4a](docs/ARCHITECTURE.md).

## Enable EARTH AI with a language model (optional)

Without a key, EARTH AI and the metadata helper work in a labelled retrieval-only mode. To enable generation, set **one** of these, for example in `.env.local` (git-ignored) or in the Synapse vault:

```
XAI_API_KEY=...          # Grok via xAI (optional XAI_MODEL; otherwise discovered from the API)
XAI_BASE_URL=...         # only for a Grok key issued by an OpenAI-compatible reseller instead of xAI
OPENROUTER_API_KEY=...   # OpenRouter (optional OPENROUTER_MODEL, default anthropic/claude-haiku-5.5)
ANTHROPIC_API_KEY=...    # Claude (optional ANTHROPIC_MODEL, default claude-opus-5-5)
```

With Synapse, keep the key out of files entirely:

```powershell
synapse vault create earth-memory
synapse secret set earth-memory grok XAI_API_KEY
synapse run -- npm run dev
```

Only public, non-sensitive records are ever sent to the provider.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Develop, build, serve |
| `npm test` | Unit and database integration tests (Vitest, in-memory PostgreSQL) |
| `npm run smoke` | Crawl every page, API endpoint and internal link of a running server |
| `npm run mcp:check` | Spawn the MCP server and exercise its tools |
| `npm run typecheck` | TypeScript |
| `npm run db:migrate` / `db:seed` / `db:inspect` | Database maintenance (stop the dev server first when using PGlite) |
| `npm run db:reset -- --yes` | Delete all data and reseed |
| `npm run db:backup` / `db:restore` | See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |

## For agents: API and MCP

- REST API: `/api/v1` (index at http://localhost:3000/api/v1, docs at `/developers`).
- MCP server: `mcp/server.ts` (stdio). Claude Code picks it up from `.mcp.json` in this repository. It is also registered in the Synapse MCP library as `earth-memory`; `synapse mcp install earth-memory` hands it to your other connected tools.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): stack, data model, trust model, risks
- [docs/DEVLOG.md](docs/DEVLOG.md): development log
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): PostgreSQL, Docker, operations, backup and recovery

## Data notice

Curated reference records were compiled from the cited public sources (UNESCO, IUCN, NASA Earth Observatory, peer-reviewed articles and others) by an AI-assisted editorial process. Imported records reuse text from English Wikipedia under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (each record names its article and carries that licence) and facts from Wikidata (CC0). Everything is **pending expert verification**. Records labelled *Demo* are fictional. No photographs, statistics or measurements were invented.
