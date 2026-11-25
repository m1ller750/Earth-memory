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

The node-postgres path uses the same Drizzle schema and migrations as the embedded database. It has been type-checked but **not yet run against a standalone PostgreSQL server** in this environment (no PostgreSQL or Docker was available). Run `npm run smoke` against the deployed instance once.

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
