# Deployment and operations

## Production with PostgreSQL

1. Provision PostgreSQL 15+ with the `pg_trgm` extension available (it is a trusted extension on most managed services).
2. Set environment variables:
   - `DATABASE_URL=postgres://user:pass@host:5432/earth_memory`
   - `NODE_ENV=production`, `PUBLIC_BASE_URL=https://your.domain`
   - optional `XAI_API_KEY` or `ANTHROPIC_API_KEY`
   - optional `DATA_DIR` for uploads (default `./data`)
   - do **not** set `DEMO_PASSWORD` unless you want demo accounts.
3. `npm ci && npm run build && npm run db:migrate && npm start`.
   Reference data is seeded on first start when the archive is empty (`AUTO_SEED=false` disables this).

The node-postgres path uses the same Drizzle schema and migrations as the embedded database. It has run against Neon (PostgreSQL 17): migrations, the full reference seed and the static-site crawl below.

## Static website on Vercel (Neon database)

The public website is the static HTML edition, not the server app:

- **Database**: a free Neon PostgreSQL project (`aws-us-east-1`), seeded once with `DATABASE_URL=… AUTO_SEED=true` and then left read-only for the site. The demo accounts that a non-production seed creates were deleted from it; never leave them on a public database.
- **Vercel project** `earth-memory` (team EAM): `vercel.json` sets `framework: null`, `buildCommand: npm run site:vercel` and `outputDirectory: site`. The build runs `next build`, starts `next start` against `DATABASE_URL` and crawls every public page into `site/` (`scripts/site/build.ts`), then Vercel serves the HTML with `cleanUrls`.
- **Environment variables** (Production and Preview): `DATABASE_URL` (Neon direct endpoint, `sslmode=require`, stored as *sensitive*), `AUTO_SEED=false`, `DATABASE_POOL_SIZE=4`, `ELECTRON_SKIP_BINARY_DOWNLOAD=1`, `PUPPETEER_SKIP_DOWNLOAD=1`, `NEXT_TELEMETRY_DISABLED=1`. No AI key is set: the static site has no server to call it.
- **What the static edition leaves out**: sign-in, contribute, review and moderation pages, and `/api/*`. `static-edition.js` maps filter and pagination links to their pre-rendered files, answers API calls with a read-only notice and shows a banner linking the desktop app. Other query strings (graph focus, map position) fall back to the plain page.
- Public address: https://earth-memory-tau.vercel.app (production domain). The team-scoped `*-eam17.vercel.app` aliases sit behind Vercel's standard deployment protection.
- Deployments are created from the public GitHub repository through the Vercel API or dashboard (Redeploy). The Vercel GitHub app is not installed, so a push alone does not deploy; install it on the repository to deploy every push to `main` automatically. Redeploy after changing the data too.

## Windows desktop app

`npm run desktop:build` runs `scripts/desktop/prepare.ts` (standalone Next.js server, static assets, migrations, PGlite, icon) and electron-builder (`electron-builder.yml`, NSIS, x64). The app forks the bundled server with `ELECTRON_RUN_AS_NODE=1`, keeps its database in `%APPDATA%\Earth Memory\data` and logs to `server.log` next to it. On a slow connection, download `electron-v45.5.0-win32-x64.zip` yourself, extract it and pass `-c.electronDist=<folder>` to electron-builder. Publish `dist-desktop/Earth-Memory-Setup.exe` as a GitHub release asset with that exact name: the `/download` page links to `releases/latest/download/Earth-Memory-Setup.exe`.

## Docker

```powershell
docker compose up --build
```

`docker-compose.yml` starts PostgreSQL 17 and the app on port 3000 with uploads in a named volume. Not tested here, because Docker isn't installed on the development machine.

## Embedded PGlite

Without `DATABASE_URL`, data lives in `data/pglite`. One process may open it at a time; a lock file (`data/pglite.lock`) prevents a second process. Stop the dev server before running `db:*` scripts. PGlite is ideal for development, demos and single-node pilots; use PostgreSQL for multi-user production.

## Backup and recovery

- **PGlite:** stop the server and copy `data/` (database and uploads), or use `npm run db:backup`, which copies `data/pglite` and `data/uploads` into `backups/<timestamp>/`. Restore with `npm run db:restore -- backups/<timestamp> --yes` (replaces the current data).
- **PostgreSQL:** `pg_dump -Fc $DATABASE_URL > earth-memory.dump`, restore with `pg_restore -d $DATABASE_URL earth-memory.dump`; back up the uploads directory (or bucket) on the same schedule.
- Test a restore regularly into a scratch database and run `npm run smoke` against it.

## Scaling notes

| Concern | Now | When scaling out |
|---|---|---|
| Rate limiting | In-memory per process | Redis or the platform's limiter |
| Uploads | Local disk (`DATA_DIR/uploads`) | S3-compatible storage behind `lib/storage` |
| Geo queries | Bounding box + haversine | PostGIS `geography` column and GiST index |
| Search | PostgreSQL full-text + trigram | Add embeddings (pgvector) for semantic search |

## Monitoring

- `GET /api/v1/health` for liveness (database driver, record count, AI provider; no secrets).
- Structured JSON logs on stdout (`audit`, `ai.*` errors). Every write is also stored in the `audit_log` table and shown on `/moderation`.

## Known build warnings

`next build` reports "Dynamic filesystem access causes tracing of the whole project" for runtime-configured data paths. This only affects output-file tracing for `output: "standalone"` bundles; a normal `next start` deployment is unaffected.
