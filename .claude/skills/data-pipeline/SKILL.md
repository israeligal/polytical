---
name: data-pipeline
description: CKAN to PostgreSQL data sync pipeline for Israeli government open data (data.gov.il). Covers the CKAN HTTP client, resource constants and IDs, Drizzle schema with 35+ domain tables, sync script with batch inserts, trigram index creation, and data verification. Use when working on data sync, adding new datasets, modifying schema tables, updating resource IDs, troubleshooting CKAN queries, or running verification scripts. For per-table structure, row counts, JSONB samples, and cross-table join keys, see references/database-data-model.md.
---

# Data Pipeline (CKAN → PostgreSQL)

ETL pipeline syncing Israeli government datasets from data.gov.il CKAN, Govmap REST, MAVAT SV4, XPLAN, and ArcGIS services into our PostgreSQL DB for agent queries.

> **Authoritative references**:
> - [`references/database-data-model.md`](references/database-data-model.md) — per-table row counts, schema, JSONB structure samples, city-code coverage. Read this for the shape of any specific table.
> - [`references/table-relationships.md`](references/table-relationships.md) — how the 35+ tables connect: the three spine keys (`semel_yishuv`, `plan_number`, `(gush,helka)`), canonical join patterns, attribution rule, known-broken joins. Read this first when planning a cross-table query.
> - **Sample data** lives in [`../../government-data-sources/fixtures/`](../../government-data-sources/fixtures/) — one real row per table for CKAN, full response shapes for Govmap/XPLAN/MAVAT/municipal. Point there instead of re-capturing.

## File Map

| Layer | Path | Purpose |
|-------|------|---------|
| HTTP Client | `app/lib/ckan-client.ts` | `fetchResource<T>()` — paginated CKAN API wrapper with timeout and caching |
| Constants | `app/lib/constants.ts` | 17 `RESOURCE_*` IDs, `CKAN_BASE_URL`, `MAX_LIMIT`, `VALID_RESOURCE_IDS` set |
| Schema | `app/lib/schema.ts` | 20+ Drizzle `pgTable()` definitions with provenance fields (domain + neighborhoods + parcels + buildings + municipal + govmap + MAVAT) |
| Sync (CKAN) | `scripts/sync-ckan-to-pg.ts` | Fetch all → truncate → batch insert (100/batch) for 15 datasets |
| Sync (polygons) | `scripts/sync-neighborhoods.ts` | Govmap Layer 22 WFS → `neighborhoods` (2,850 polygons nationwide, ST_Force2D ingest, chunked self-heal for derived fields) |
| Sync (cadastre) | `scripts/sync-parcels.ts` | `helkot.zip` (cp1255, IAP-gated) → **parcels DB** (`PARCELS_DATABASE_URL`), 1.09M rows |
| Seed (Carmelit) | `scripts/seed-carmelit-stations.ts` | 6 Haifa Carmelit funicular stations → `lrt_stations` (one-time, transactional, idempotent re-run via `pnpm seed:carmelit`) |
| Sync (תת"ל corridors) | `scripts/sync-mavat-tatal-xplan.ts` | XPLAN Layer 1 `pl_number LIKE 'תתל%'` + `entity_subtype_desc='תכנית לתשתית לאומית'` → `mavat_plan_data` rows with `plan_kind='tatal_transit'` + WGS84 `boundary_geom_4326`. 164 substantive plans, throws `MAVAT_TATAL_XPLAN_EMPTY` on empty result. Run: `pnpm sync:mavat:tatal`. |
| Backfill (cross-DB) | `scripts/backfill-stat-area-from-parcels.ts` | Merges parcels-DB `(gush,helka)→stat_area_code` into main-DB `govmap_deals` + `urban_renewal` (client-side — cross-DB PostGIS is impossible) |
| Indexes | `scripts/create-trgm-indexes.ts` | 15 GIN trigram indexes on city/name columns across 9 tables |
| Verify CKAN | `scripts/verify-data-layer.ts` | Tests CKAN resources: Hebrew search, pagination, errors |
| Verify Tools | `scripts/verify-pg-tools.ts` | Tests Mastra tools against PostgreSQL data |
| Types | `app/lib/types.ts` | Shared TypeScript types for CKAN records |

## Data Flow

```
data.gov.il CKAN API
  → fetchResource<T>() [ckan-client.ts]
    - Full-text search via `query` param (not `filters` for Hebrew)
    - 15s timeout, max 1000 records per request
    - 24h cache via Next.js revalidate (server context only)
  → fetchAllCkan() [sync-ckan-to-pg.ts]
    - Paginates through all records (offset-based, limit 1000)
  → mapRecord() transforms CKAN fields → DB columns
    - trim(), toInt(), toFloat() for data cleaning
    - Adds provenance: sourceDataset, resourceId, dataGovUrl, fetchedAt
  → TRUNCATE TABLE (not incremental — full reload each sync)
  → Batch INSERT (100 records) via Drizzle ORM
    - Neon ~6500 param limit constrains batch size
  → GIN trigram indexes [create-trgm-indexes.ts]
    - Enable fuzzy substring search on city/name fields
```

## Dataset Categories

- **Housing**: urban_renewal, lottery, construction_progress, active_construction, public_housing_inventory, public_housing_vacancies
- **Infrastructure**: tma3_roads, tma23_rail, transport_projects, national_transport, mass_transit
- **Transport (seeded)**: train_stations (66), metro_stations (109 M1/M2/M3), lrt_stations Haifa Carmelit subset (6 funicular stations seeded via `pnpm seed:carmelit` outside CKAN; sentinel ckan_ids 99000001-99000006; coexists with the 332 CKAN-sourced LRT rows in the same table, discriminated via `line + metroArea + company`)
- **Professionals**: contractors, brokers, appraisers
- **Economics**: development_costs, green_buildings
- **Neighborhoods (Govmap Layer 22 via WFS)**: `neighborhoods` — 2,850 nationwide polygons with WGS84 `geom` (GIST), precomputed `centroid_lat/lng`, `stat_area_codes[]` (ST_Intersects against `statistical_areas` with ≥5% area overlap at sync time). No `aliases[]` — exact name match + pg_trgm HITL suggestions only (folk names collide across polygons, reputation rule)
- **Cadastre (separate parcels DB)**: `parcels` — 1.09M scalar rows on `PARCELS_DATABASE_URL` from `helkot.zip` (cp1255, IAP-gated). Agent runtime never touches this DB; used only for `(gush,helka)→stat_area_code` backfill on main-DB tables

## Key Patterns

- **Provenance metadata**: Every record stores `sourceDataset`, `resourceId`, `dataGovUrl`, `fetchedAt` — used by agent for source citations
- **SyncConfig array**: Each dataset defined as `{ name, resourceId, table, dataGovUrl, mapRecord }` in sync script
- **Hebrew search**: Use CKAN `query` parameter (full-text) — `filters` requires exact match including whitespace
- **Trigram search**: `pg_trgm` + GIN indexes enable `%` operator for fuzzy matching in `db-queries.ts`

## Gotchas

- CKAN `filters` parameter requires exact match including trailing whitespace — always use `query` for user-facing Hebrew searches
- Batch size of 100 chosen to avoid Neon's ~6500 query parameter limit (tables with many columns risk hitting it)
- `pgvector` extension is optional (try-catch in init-db.ts) — not available on all Neon plans
- `sync-ckan-to-pg.ts` has `@ts-expect-error` on dynamic table inserts (Drizzle typing limitation with variable table refs)
- Next.js `revalidate` caching only works in server context — standalone scripts don't cache
- 15 of 17 datasets synced; "Lottery No Draw" resource excluded from sync configs
- Sync is destructive (TRUNCATE + re-insert) — no rollback or incremental strategy
