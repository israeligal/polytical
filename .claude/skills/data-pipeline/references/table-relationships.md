# Table relationships — how our 35+ tables connect

**Companion to**: [`database-data-model.md`](./database-data-model.md) (per-table detail, row counts, JSONB samples).
**Last verified**: 2026-04-20 against Aiven production.

The DB has NO declared foreign-key constraints between domain tables (only between user-scoped tables and `user`). Relationships are logical — maintained by conventions in `repositories/*` and join code in `mastra/tools/knowledge/*`. This file documents those logical joins so future code can reuse them correctly.

## Table of contents

- [The three spine keys](#the-three-spine-keys)
- [Core relationship map](#core-relationship-map)
- [Spine 1: `semel_yishuv` — city code](#spine-1-semel_yishuv--city-code)
- [Spine 2: `plan_number` — MAVAT/XPLAN plan identifier](#spine-2-plan_number--mavatxplan-plan-identifier)
- [Spine 3: `(gush, helka)` — cadastre parcel key](#spine-3-gush-helka--cadastre-parcel-key)
- [Location join patterns (coords, polygons, stat_areas)](#location-join-patterns-coords-polygons-stat_areas)
- [Cross-source identity: the attribution rule](#cross-source-identity-the-attribution-rule)
- [Broken / weak joins (don't use for attribution)](#broken--weak-joins-dont-use-for-attribution)

---

## The three spine keys

Every meaningful cross-table query in Dirot travels on one of three join keys. Know these three and you can trace any data-flow in the app.

| Spine | Type | Coverage | Where it's clean | Where it's messy |
|---|---|---|---|---|
| **`semel_yishuv`** (CBS city code) | int | ≥95% on every major table | `city_registry` (pk), `urban_renewal.semel_yeshuv`, `statistical_areas.city_code`, `socioeconomic_index.city_code`, `bus_stops.city_code`, `parcels.locality_id`, `govmap_deals.stat_city_code` (87%) | `contractors.shem_yishuv`, `brokers.city`, `appraisers.city`, `green_buildings.municipality_name`, `active_construction.city_name` — **string-keyed only**, use `cityIlikePatterns` |
| **`plan_number`** (MAVAT/XPLAN ID) | text | 774/774 in `mavat_plan_data`, 906/906 in `urban_renewal.mispar_tochnit` (many empty), via XPLAN `pl_number` | `mavat_plan_data.plan_number` (pk), XPLAN Layer 1 `pl_number` | Legacy formats (`בי/419`, `תמל/2001`) need 4-strategy fallback via `resolvePlanCentroid` |
| **`(gush, helka)`** (cadastre parcel) | int+int | 1,093,470/1,093,470 in `parcels` (Phase 1a, 67% of national total), partial on `govmap_deals`, partial on `urban_renewal` | `parcels.gush+helka` (pk-like), `govmap_deals.gush_num+parcel_num` | Old `urban_renewal` rows often missing; some Govmap polygons have no gush/helka at all (19 known exceptions) |

---

## Core relationship map

```
                                      ┌──────────────────────┐
                                      │    city_registry     │ ← canonical city catalog (1,387 cities)
                                      │  pk: semel_yishuv    │   name_he + name_he_legacy[] + bbox
                                      └──────────┬───────────┘
                                                 │ semel_yishuv (every table below joins here)
                ┌────────────────────────────────┼────────────────────────────────┐
                │                                │                                │
     ┌──────────▼──────────┐          ┌──────────▼──────────┐          ┌──────────▼────────┐
     │  statistical_areas  │          │   socioeconomic_    │          │   parcels         │
     │  city_code (=semel) │◄────────►│   index             │          │  locality_id      │
     │  3,857 polygons     │ 2022↔2011│  city_code + stat_  │          │  1.09M cadastre   │
     │  geom (SRID 4326)   │ MISMATCH │  area_code (2011!)  │          │  gush+helka+centroid
     └──────────┬──────────┘          └─────────────────────┘          └────────┬──────────┘
                │ geometry contains                                              │ (gush,helka)
                │                                                                │
     ┌──────────▼──────────┐          ┌─────────────────────┐          ┌────────▼──────────┐
     │     govmap_deals    │          │   urban_renewal     │          │    buildings      │
     │  stat_city_code     │◄─plan_#──┤   mispar_tochnit    │          │  gush+helka+      │
     │  stat_area_code     │   match  │   semel_yeshuv      │          │  street+house#    │
     │  polygon_id (gov)   │          │   lat/lng           │          │  sources[] JSONB  │
     │  gush+helka (partial)│          │   coord_source      │          └──────────┬───────┘
     │  neighborhood (str) │          └──────────┬──────────┘                     │ gush+helka
     └─────────────────────┘                     │ mispar_tochnit                  │
                                                 │  =                              │
                ┌────────────────────────────────▼─────────────┐                   │
                │            mavat_plan_data                   │                   │
                │  pk: plan_number                             │                   │
                │  plan_addresses[] JSONB:                     │                   │
                │    CITY_COUNTY_CODE (=semel) + STREET_NAME   │◄──────────────────┘
                │    + HOUSE_NUMBER (nullable) + GUSH + HELKA  │   building-level
                │  decisions[], timeline[], participants[]      │   attribution only
                │  oppositions[], opposition_analysis           │   when HOUSE_NUMBER present
                └──────────────────────┬───────────────────────┘
                                       │ plan_number match ONLY
                                       │  (no fuzzy, no street-only for facts)
                ┌──────────────────────┴─────────────────┐
                │                                        │
     ┌──────────▼──────────┐                 ┌──────────▼──────────┐
     │  municipal_projects │                 │  XPLAN Layer 1      │
     │  addresses[] JSONB  │                 │  (live ArcGIS query)│
     │  plan_numbers[]     │                 │  pl_number          │
     │  Holon scraper +    │                 │  35 fields: timeline,
     │  Phase 1.5 docs     │                 │  quantities, status │
     └─────────────────────┘                 └─────────────────────┘
```

Supporting tables (transit/infra/services/professionals) join by coord (bbox + haversine) or by `semel_yishuv`:

```
bus_stops, lrt_stations, metro_stations, train_stations, schools, green_buildings
      │
      └── city_registry (semel_yishuv) OR lat/lng spatial filter

contractors, brokers, appraisers, active_construction
      │
      └── cityIlikePatterns({city}) — string-keyed sources, no semel
```

---

## Spine 1: `semel_yishuv` — city code

The single most reliable cross-table key. Use whenever available.

### Canonical join paths

```sql
-- Deals in a city (numeric — fast, spelling-proof)
SELECT * FROM govmap_deals WHERE stat_city_code = '6200';  -- Bat Yam

-- PB projects
SELECT * FROM urban_renewal WHERE semel_yeshuv = 6200;

-- Every stat area in a city
SELECT * FROM statistical_areas WHERE city_code = '6200';

-- Bus stops in a city
SELECT * FROM bus_stops WHERE city_code = 6200;

-- City-level socioeconomic (CBS 2011 codes)
SELECT * FROM socioeconomic_index WHERE city_code = 6200;

-- Every parcel in a city
SELECT * FROM parcels WHERE locality_id = 6200;
```

### String-keyed tables that DON'T have semel_yishuv

Always use `cityIlikePatterns({city})` from `app/lib/city-match.ts`:

```typescript
import { cityIlikePatterns } from "@/app/lib/city-match"
const patterns = cityIlikePatterns({ city: "פתח תקווה" })
// → ["%פתח תקווה%", "%פתח תקוה%"]   (covers both spellings)
```

Tables requiring this: `contractors.shem_yishuv`, `brokers.city`, `appraisers.city`, `green_buildings.municipality_name`, `active_construction.city_name`, `public_housing_inventory.city_lms_name`, `buildings.city_name`.

---

## Spine 2: `plan_number` — MAVAT/XPLAN plan identifier

The attribution spine for anything relating to planning actions (approvals, developers, oppositions, committee decisions).

### Canonical join paths

```sql
-- MAVAT enrichment for a CKAN plan
SELECT u.*, m.developer_name, m.decisions, m.opposition_count
FROM urban_renewal u
LEFT JOIN mavat_plan_data m ON m.plan_number = u.mispar_tochnit
WHERE u.mispar_tochnit != '';

-- XPLAN live-query for timeline (ArcGIS, not in DB)
-- Call: queryXplanPlanDetail({planNumber: "502-0259184"})
--   → returns 35 fields: gazetted_date, objectives, approved_units, etc.

-- Municipal projects that reference a plan
SELECT * FROM municipal_projects WHERE plan_numbers @> '["502-0259184"]'::jsonb;
```

### Legacy format fallback

Old plans don't follow `502-xxxxxxx`. Examples: `בי/419`, `תמל/2001`, `רג/מק/5510`. `resolvePlanCentroid` in `mastra/tools/urban-renewal-coords.ts` tries 4 strategies in order: exact `pl_number =`, token-normalized `pl_number LIKE`, `pl_name LIKE` exact, token-normalized `pl_name LIKE`. The `plan_county_name` filter on legacy fallbacks prevents short-prefix false positives across cities.

---

## Spine 3: `(gush, helka)` — cadastre parcel key

The most authoritative spatial identifier — same parcel system used by the Tabu land registry. Use for building-level attribution when address isn't reliable.

### Canonical join paths

```sql
-- Deals on a specific parcel
SELECT * FROM govmap_deals 
WHERE gush_num = 30123 AND parcel_num = 45;

-- Parcel centroid (to scope any spatial query)
SELECT centroid_lat, centroid_lng, legal_area_m2 
FROM parcels WHERE gush = 30123 AND helka = 45;

-- Does the plan cover this parcel? (via MAVAT plan_addresses)
SELECT plan_number FROM mavat_plan_data 
WHERE plan_addresses @> ('[{"GUSH_NUM": 30123, "HELKA_NUM": 45}]')::jsonb;
```

### Building-level attribution via gush/helka

`buildings` joins cleanly:
```sql
SELECT b.*, p.centroid_lat, p.centroid_lng, p.legal_area_m2
FROM buildings b
LEFT JOIN parcels p ON p.gush = b.gush AND p.helka = b.helka
WHERE b.gush = 30123 AND b.helka = 45;
```

This is the preferred path for the reputation rule: parcel identity doesn't spell-vary, doesn't change with city-name politics, doesn't depend on house-number conventions.

---

## Location join patterns (coords, polygons, stat_areas)

When no shared ID exists, use spatial joins. WGS84 (lat/lng, SRID 4326) is our lingua franca.

### Bbox-first then haversine

For "X within N km of point":
```sql
-- fast bbox pre-filter using btree indexes on lat/lng
WITH box AS (SELECT 34.77 - 0.01 AS lng_min, 34.77 + 0.01 AS lng_max,
                    32.07 - 0.01 AS lat_min, 32.07 + 0.01 AS lat_max)
SELECT * FROM schools, box
WHERE lat BETWEEN lat_min AND lat_max 
  AND lng BETWEEN lng_min AND lng_max;
-- then client-side haversine on the smaller set for exact distance
```

Helper: `boundingBox({lat, lng, radiusKm})` + `haversineDistance(a, b)` in `mastra/tools/scoring-proximity.ts`.

### Point-in-polygon (ST_Contains)

For "what city / stat_area / neighborhood is this point in?":
```sql
SELECT sa.city_code, sa.area_name
FROM statistical_areas sa
WHERE ST_Contains(sa.geom, ST_SetSRID(ST_MakePoint(34.77, 32.07), 4326));
```

This is how we backfilled `schools.city_name` on 2026-04-20 (27,369 rows in one statement — see `scripts/backfill-schools-city-name.ts`).

### Known coord-system traps

- **Govmap `/real-estate/deals/{x,y}/{r}`** takes EPSG:3857 Web Mercator, NOT ITM. Use `autocompleteAddress({searchText})` and pass its `x`/`y` verbatim — don't convert.
- **`statistical_areas.geom` SRID is 4326.** Match with `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` — note (lng, lat) order, NOT (lat, lng).
- **`lrt_stations`** has both ITM (`x`, `y`) and backfilled WGS84 (`lat`, `lng`). Use `lat`/`lng` for joins. `wgs84ToItm()` via proj4 only when calling ITM-native APIs.

---

## Cross-source identity: the attribution rule

Ref: [CLAUDE.md §Data Accuracy](/CLAUDE.md).

**Concrete facts about a specific building** (developer, approval date, unit count, plan number, status) require an EXACT-match join key: `plan_number`, `(gush, helka)`, or `(exact street + house_number + city_code)`.

**Valid attribution joins:**
```sql
-- ✓ plan-level fact, exact key
mavat_plan_data.plan_number = urban_renewal.mispar_tochnit

-- ✓ parcel-level fact, exact key  
govmap_deals.gush_num = parcels.gush AND govmap_deals.parcel_num = parcels.helka

-- ✓ building-level fact, exact address
plan_addresses @> '[{"STREET_NAME":"דיזנגוף","HOUSE_NUMBER":"1","CITY_COUNTY_CODE":5000}]'::jsonb
```

**Invalid for attribution — but fine as discovery context with a `matchType` label:**
```sql
-- ✗ never attribute developer via this:
LIKE '%דיזנגוף%' AND semel_yeshuv = 5000  -- street-only
ILIKE '%some name%'                         -- substring
similarity(...) > 0.7                       -- pg_trgm fuzzy

-- ✓ OK for "found at street level" UI label with matchType: "street"
```

Repos that tag matches: `repositories/mavat-plan-data.ts`, `repositories/municipal-projects.ts`, `repositories/urban-renewal.ts` (returns `matchType: "fuzzy"` + `matchScore`), `repositories/construction.ts`, `repositories/lottery.ts`.

---

## Broken / weak joins (don't use for attribution)

Flagged for future cleanup or explicit avoidance:

| Weak join | Why it's broken | What to use instead |
|---|---|---|
| `statistical_areas.city_code (2022)` ↔ `socioeconomic_index.city_code (2011)` | Same physical coord, different stat_area_code numbers (2022 codes add 6xx-7xx; 2011 stops at 534). ~25% mismatch in newer polygons. | For now: accept drops, document as "data gap". Long-term: build `stat_area_2022_to_2011` crosswalk. |
| `govmap_deals.neighborhood` (free text) ↔ `urban_renewal.shem_mitcham` (plan name) | Different label systems entirely. "הרומנים" (CKAN) vs "כוכב הים" (Govmap) — same place, no intersection. | Spatial resolution via lat/lng — never string matching across these two sources. |
| Nadlan `PolyNeighSett.json` polygon_id ↔ `govmap_deals.polygon_id` | Different ID spaces: 8-digit numeric vs `NNNN-NNN` format. **0 joins out of 5 tested polygons.** | Use Govmap's own `neighborhood` string (100% coverage on Bat Yam sample). See [`docs/key-decisions/2026-04-20-nadlan-bulk-integration.md`](/docs/key-decisions/2026-04-20-nadlan-bulk-integration.md). |
| `contractors.shem_yishuv` + name substring → "developer of this plan" | Multiple contractors per city, no 1:1 with plans. | Attribute developer ONLY via `mavat_plan_data.developer_name` when plan resolves. Otherwise: "לא זוהה יזם". |
| `active_construction` matched to an address | Street-only match; no house-number-level accuracy in CKAN export. | Present as `matchType: "street-substring"` nearby context, never attribution. |

Every one of these traps has bitten us before. Keep adding to this table when new ones surface.

## Data-quality residuals (known + characterized 2026-04-20)

Small coverage gaps we've accepted rather than force-fixed. Don't re-investigate unless a user complaint traces back to one:

- **`schools.city_name` = null on 943 rows (3.3%)** — every one has valid lat/lng but sits 10–1,500m **outside** its nearest stat_area polygon. Cluster is West Bank / Judea & Samaria settlements (מעלה לבונה, כוכב השחר, ברכה, עמנואל, טלמון, כוכב יעקב, מעלה אדומים). CBS's `statistical_areas` dataset handles these differently — not a bug on our side. Most sit within 50m of a polygon edge, so a buffered `ST_DWithin(geom, point, 50)` second pass would recover ~70%. Not scoped today.
- **`mavat_plan_data` = 774 of 906 urban_renewal plans.** The 92-row gap is categorized in [`fixtures/mavat/unsyncable-plans.md`](../../government-data-sources/fixtures/mavat/unsyncable-plans.md): 80 early-stage (by design, appear once deposited), 11 legacy format with no scrape URL (would need MAVAT site-search harness), 1 CKAN data-quality noise row.
- **`lrt_stations` WGS84 coords** — **all 332 stations have valid coords within Israel's bbox.** The live risk is purely methodological: `lrt_stations.lat/lng` were backfilled from EPSG:2039 ITM via our 2-param linear approximation in `itmToWgs84`, not real proj4. Accurate to within ~10m for relative-distance math; don't use for absolute-coord comparisons against other sources.
