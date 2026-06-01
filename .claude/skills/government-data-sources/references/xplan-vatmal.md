# XPLAN ArcGIS + VATMAL (ags.iplan.gov.il)

Both services live on `ags.iplan.gov.il`, same ArcGIS REST family. XPLAN is the main planning-authority polygon layer (50 fields, 5 sub-layers); VATMAL is the Declared Urban Renewal Complexes layer (18 fields, single layer).

## 4. XPLAN ArcGIS

```
GET https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/{layerId}/query
```

### Available Layers (5 total, verified 2026-04-10)

| Layer | Name | Geometry | Fields | Status |
|-------|------|----------|--------|--------|
| **0** | ישויות נקודתיות (Points) | Point | 16 | Queried for centroid (basic fields) |
| **1** | קוים כחולים-תכניות מקוונות (Plan Polygons) | Polygon | **50** | Queried: `queryXplan` (37 fields), `queryXplanPlanDetail` (`*` + geometry) |
| **2** | ישויות קוויות (Lines) | Polyline | ~17 | Not queried — linear plan entities |
| **3** | ישויות פוליגונליות (Polygon entities) | Polygon | 17 | Not queried — same schema as Layer 4 minus `station`/`station_desc` |
| **4** | יעודי קרקע (Land Use Zones) | Polygon | 19 | Queried: `queryXplanLandUseZones` (6 of 19 fields) |

Max records per request: 1000 (all layers). Supports pagination (`resultOffset`).

### Layer 1: Plan Polygons — COMPLETE 50-Field Schema (verified 2026-04-10)

We fetch 37 fields in `XPLAN_OUT_FIELDS`. Here is the complete schema:

**Plan Identity (10 fields):** ✅ = in XPLAN_OUT_FIELDS, ❌ = not fetched

| Field | Type | Alias | Fetched? |
|-------|------|-------|----------|
| `pl_number` | String | מספר תכנית | ✅ |
| `pl_name` | String | שם תכנית | ✅ |
| `pl_id` | Double | מספר מהדורה | ✅ (mapped but not surfaced by tools) |
| `mp_id` | Double | מזהה תכנית ראשי → `https://mavat.iplan.gov.il/SV4/1/{mp_id}/310` | ✅ |
| `pl_url` | String | קישור לאתר מידע תכנוני | ✅ |
| `station_desc` | String | תיאור סטטוס (e.g., "אישור") | ✅ |
| `internet_short_status` | String | שלב תכנוני רצוי | ✅ |
| `entity_subtype_desc` | String | תת-סוג תכנית | ✅ |
| `plan_charactor_name` | String | סוג היתר שניתן להוציא | ✅ |
| `pl_by_auth_of` | Double | היררכיית סמכות ועדה | ❌ |

**Plan Timeline (11 date fields — ALL fetched):**

| Field | Meaning | Example (Rothschild) | Fetched? |
|-------|---------|---------------------|----------|
| `receiving_date` | Plan submitted | 2018-03-25 | ✅ |
| `date_saf` | Threshold conditions met | 2018-10-07 | ✅ |
| `depositing_date` | Deposit discussion | 2019-03-25 | ✅ |
| `pl_date_advertise` | Newspaper publication | 2019-11-20 | ✅ |
| `pl_last_deposit_date` | Last deposit | 2020-01-19 | ✅ |
| `pl_rejection_date` | Objection deadline | 2020-02-17 | ✅ |
| `pl_date7` | Approval discussion date | 2020-03-08 | ✅ |
| `pl_date_8` | Official gazette (Reshumot) | 2020-03-08 | ✅ |
| `on_hold_date` | Approval treatment start | 2020-03-08 | ✅ |
| `open_date` | Approval treatment end | — | ✅ (mapped to `approvalEndDate` but not surfaced in tool output) |
| `last_update_date` | Last record update | — | ✅ |

These dates reconstruct the **full plan lifecycle** — critical for timeline analysis, stagnation detection, and velocity scoring.

**Building Program (13 quantity fields — 9 fetched, 4 NOT fetched):**

| Field | Type | Meaning | Fetched? |
|-------|------|---------|----------|
| `pq_authorised_quantity_120` | Double | Approved housing units (יח"ד) | ✅ |
| `quantity_delta_120` | Double | Change in housing units | ✅ |
| `quantity_delta_125` | Double | Change in housing area (sqm) | ✅ |
| `quantity_delta_75` | Double | Change in commercial area (sqm) | ✅ |
| `quantity_delta_105` | Double | Change in hotel/tourism area (sqm) | ✅ |
| `quantity_delta_110` | Double | Change in special housing units | ✅ |
| `quantity_delta_60` | Double | Change in employment area (sqm) | ✅ |
| `quantity_delta_80` | Double | Change in public buildings (sqm) | ✅ |
| `pq_implementation_105` | Double | Tourism for realization (sqm) | ✅ |
| `pq_authorised_quantity_105` | Double | Authorized hotel rooms (sqm) | ❌ |
| `pq_authorised_quantity_110` | Double | Authorized special housing (sqm) | ❌ |
| `pq_detailed_plan_105` | Double | Proposed hotel/tourism rooms | ❌ |
| `pq_detailed_plan_110` | Double | Proposed special housing units | ❌ |
| `pq_detailed_plan_80` | Double | Proposed public buildings (sqm) | ❌ |

**Geography & Jurisdiction (10 fields):**

| Field | Type | Meaning | Fetched? |
|-------|------|---------|----------|
| `pl_area_dunam` | Double | Plan area in dunams | ✅ |
| `shape_area` | Double | Polygon area (sqm, computed) | ✅ (mapped but not surfaced) |
| `shape_length` | Double | Polygon perimeter (m) | ❌ |
| `plan_county_name` | String | שם יישוב — **critical for scoping fuzzy queries** | ✅ |
| `plan_area_name` | String | מרחב תכנון | ✅ (mapped but not surfaced) |
| `district_name` | String | שם מחוז | ✅ |
| `ja_concat` | String | שרשור ועדת תכנון | ✅ |
| `pa_concat` | String | שרשור מרחבי תכנון | ❌ |
| `jurstiction_area_name` | String | תחום גבול שיפוט | ❌ |
| `pl_landuse_string` | String | סוג ייעוד קרקע | ✅ |

**Content & Versions (4 fields):**

| Field | Type | Meaning | Fetched? |
|-------|------|---------|----------|
| `pl_objectives` | String | מטרות (free text, sometimes has developer names) | ✅ |
| `pl_order_print_version` | Double | Regulation document version | ❌ (available via `*`) |
| `pl_tasrit_prn_version` | Double | Site plan version | ❌ (available via `*`) |
| `objectid` | OID | ArcGIS object ID | (auto) |

**Geometry note:** Default spatial reference is `{wkid: 2039, latestWkid: 2039}` (Israeli ITM / EPSG:2039). **Always pass `outSR=4326` to get WGS84 `[lng, lat]` directly** — do NOT attempt to convert ITM client-side. The `itmToWgs84` function in `mastra/tools/scoring-proximity.ts` is a 2-parameter linear approximation tuned for relative distance math within the app, not a real EPSG:2039↔WGS84 converter; feeding it real ITM coordinates produces ~300 km errors.

**Integrated in:** `mastra/tools/xplan-queries.ts` → `queryXplan()` (37 fields via `XPLAN_OUT_FIELDS`), `queryXplanPlanDetail()` (`outFields: "*"` + geometry, single-plan detail). `mastra/tools/urban-renewal-coords.ts` → `resolvePlanCentroid()` (PB centroid backfill for `urban_renewal.lat`/`lng`).

### Plan-number format gotcha (PB coord backfill)

`urban_renewal.mispar_tochnit` values come in two formats, and XPLAN handles them very differently:

1. **Modern** (`502-XXXXXXX`, ~79% of `urban_renewal` rows) — stored directly in `PL_NUMBER`. `WHERE pl_number = '<n>'` works cleanly. 4/4 sampled modern plans resolved on first try.

2. **Legacy** — stored inconsistently:
   - `תמל/` (national PB plans) → stored in `PL_NUMBER` **with a space after the slash** (e.g. `'תמל/ 2035'`, not `'תמל/2035'`). Direct `=` match fails — need `pl_number LIKE` with whitespace tolerance.
   - `בי/`, `רג/`, `נת/`, `רח/`, `גב/`, `תא/`, etc. (municipal prefixes) → **never appear** in `PL_NUMBER` at all. They only appear as substrings embedded inside `PL_NAME` of newer derivative plans. Example: `בי/479` → `PL_NUMBER='502-0367003'`, `PL_NAME='בי/479/ 1/מק - מתחם בלפור יצחק שדה- איחוד וחלוקה'`.
   - Sometimes with extra whitespace between segments: `בי/517` → `PL_NAME='בי/  517 / 1 / מק- מתחם כצנלסון איחוד וחלוקה'` (two spaces after `/`, more spaces inside).

**The 4-step resolver** in `resolvePlanCentroid({ planNumber, city? })`:
1. `pl_number = '<input>'` (exact) — catches all modern plans cleanly.
2. `pl_number LIKE '<tokens joined with %>'` — catches `תמל/ 2035` via `'תמל%2035'`.
3. `pl_name LIKE '%<input>%'` — catches `בי/479` embedded in derivative `pl_name`.
4. `pl_name LIKE '%<tokens joined with %>%'` — catches whitespace-split variants like `בי/  517`.

**Critical: always scope legacy fallbacks (steps 2–4) by `plan_county_name = '<city>'`.** Without it, short Hebrew prefixes produce cross-city false positives: `בי/517` would wildcard-match a northern-Israel plan containing `בי` and `517` substrings. Verified: with city scoping, Bat Yam PB hits 34/37 (92%); without it, at least one Bat Yam input mis-resolved to lat=32.79 (~300 km away).

Overall backfill hit rate on 864 rows: **688 resolved (79.6%)** — 631 modern, 52 legacy (40 via step 2 + 5 via step 3 + 12 via step 4), 176 skipped (older plans genuinely missing from XPLAN's online dataset, cannot be resolved by this path).

### ArcGIS REST Query parameter reference

All XPLAN and other iplan ArcGIS services expose the standard Esri `query` operation. Parameters we use (or may need):

| Param | Purpose | Our usage | Gotcha |
|-------|---------|-----------|--------|
| `where` | SQL-92 WHERE clause | `pl_number = '502-0196659'` or `pl_name LIKE '%בי/479%'` | URL-encode Hebrew + `/`; single-quote string literals; escape embedded quotes with `''` |
| `outFields` | Fields to return (comma list, `*` = all) | `pl_number,pl_name` or `*` | Omitting returns no attributes |
| `returnGeometry` | Include geometry | `true` for centroid resolution, `false` for attribute-only | `false` is faster for bulk queries |
| `outSR` | Output spatial reference WKID | **`4326` for WGS84 `[lng, lat]`** | Default is the layer's native SR (2039 for XPLAN). Always pass `4326` if you want WGS84 — do NOT convert ITM client-side |
| `inSR` | Input geometry SR (for spatial filters) | `2039` when sending ITM polygon | Omit if using WGS84 input |
| `geometry` | Spatial filter geometry (JSON-encoded) | Polygon rings for Layer 4 land-use zone spatial query | Must URL-encode the JSON |
| `geometryType` | Type of `geometry` | `esriGeometryPolygon` / `esriGeometryPoint` / `esriGeometryEnvelope` | Defaults to envelope if omitted |
| `spatialRel` | Spatial relationship | `esriSpatialRelIntersects` (default) | Not all rels supported on all layers — check `supportedSpatialRelationships` |
| `resultRecordCount` | Max records per request | `5` for sampling, up to layer max | Layer's `maxRecordCount` caps it |
| `resultOffset` | Pagination offset | `0`, `1000`, ... | Requires `supportsPagination: true` (XPLAN has it) |
| `orderByFields` | Sort order | `pl_number ASC` | Some layers restrict to indexed fields |
| `f` | Response format | `json` (always), `geojson` (sometimes) | `geojson` incompatible with `returnM=true` |
| `returnCountOnly` | Only return count + extent | `true` for size checks | Useful before large pagination runs |

Source: https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/

### Verified live query examples (2026-04-09)

**Layer schema introspection** (all fields, geometry type, spatial reference, capabilities):
```bash
curl "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/1?f=json"
# → { name, geometryType: "esriGeometryPolygon", defaultSpatialRef: {wkid: 2039},
#     capabilities: "Map,Query,Data", fields: [ {name: "pl_number", type: "esriFieldTypeString", ...}, ...] }
```

**Plan by modern number + WGS84 geometry:**
```bash
curl "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/1/query?\
where=pl_number='502-0196659'&outFields=pl_number,pl_name&returnGeometry=true&outSR=4326&f=json"
# → { features: [{ attributes: { pl_number: "502-0196659", pl_name: "בי/475-מתחם רוטשילד" },
#                   geometry: { rings: [[[34.742311, 32.027585], ...]] } }] }
# centroid: { lat: 32.027069, lng: 34.742493 } — correct for Bat Yam Rothschild area
```

**Legacy plan via `pl_name` substring** (catches `בי/479` embedded in a derivative):
```bash
curl "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/1/query?\
where=pl_name LIKE '%בי/479%' AND plan_county_name = 'בת ים'&\
outFields=pl_number,pl_name&returnGeometry=true&outSR=4326&f=json"
# → pl_number: "502-0367003", pl_name: "בי/479/ 1/מק - מתחם בלפור יצחק שדה..."
```

**Legacy `תמל/` plan via token-normalized `pl_number LIKE`** (catches whitespace-after-slash):
```bash
curl "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/1/query?\
where=pl_number LIKE 'תמל% 2035' AND plan_county_name = 'בת ים'&\
outFields=pl_number,pl_name&returnGeometry=true&outSR=4326&f=json"
# → pl_number: "תמל/ 2035", pl_name: "תמ\"ל 2035 - בת ים דליה" (the reference plan!)
```

### Layer 4: Land Use Zones (19 fields, integrated)

Spatial query within a plan area returns individual land use zones:

```
?where=1=1
&geometry={"rings":[[[x1,y1],[x2,y2],...]]}&geometryType=esriGeometryPolygon
&spatialRel=esriSpatialRelIntersects
&outFields=*&f=json
```

**Returns zones like:**
- מגורים ד' — 1,528 sqm
- מגורים ותיירות — 3,706 sqm
- מבנים ומוסדות ציבור — 1,281 sqm
- שטח ציבורי פתוח — 429 sqm
- דרך מוצעת — 394 sqm

Each zone has its own polygon, area, and associated plan number. Also discovers **related/sibling plans** — subdivision plans, road plans, etc.

**All 19 fields:** objectid, group_id, layer_id, mavat_code, mavat_name, mp_id, pl_id, pl_name, pl_number, pl_order_print_version, pl_tasrit_prn_version, legal_area (שטח רשום דונם), num (תא שטח ID), station (status code), station_desc (סטטוס), last_update_date, shape, shape_area (שטח מחושב), shape_length (היקף)

**We fetch only 6:** `mavat_code`, `mavat_name`, `pl_number`, `pl_name`, `legal_area`, `shape_area`. Missing: `station_desc` (zone plan status), `num` (parcel ID), `mp_id` (MAVAT link).

**Use cases:**
- Visual land use breakdown for plan cards
- Related plan discovery (sibling/child plans)
- Density calculation per zone
- Commercial vs residential ratio

**Status:** Integrated via `queryXplanLandUseZones()` in `mastra/tools/xplan-queries.ts`. Called by `planDetail` tool using plan polygon from Layer 1.

---

## 4c. תת"ל / National Infrastructure Plans via XPLAN (verified 2026-04-26)

תת"ל plans (Tochniyot Tashtit Le'umit — transit corridors, ports, airfields, highways, rail) live on the **same XPLAN Layer 1** as urban-renewal plans, just under a different `entity_subtype_desc`. **XPLAN is the primary fetch path** because it's free, no-auth, and (critically) returns the plan polygon in WGS84 — meaning point-in-polygon containment for "is this building inside the corridor footprint?" is doable directly, no SV4 reCAPTCHA needed.

### Counts & filters (live probe, 2026-04-26)

| `entity_subtype_desc` value | Count | What it is |
|---|---:|---|
| `תכנית לתשתית לאומית` | **164** | The substantive infrastructure plan — **this is what to ingest** |
| `הודעה לפי ס' 76 ג1 ו-77 וקביעת תנאים לפי ס' 78` | 124 | Publication notice — same physical plan, procedural variant |
| `הודעה לפי סעיף 77 ו 78 לחוק התכנון והבניה` | 14 | Older-format publication notice |
| `תשריט מתקן` | 4 | Facility-drawing variant |
| **Total `pl_number LIKE 'תתל%'`** | **306** | (164 substantive + 142 procedural duplicates) |

**Always filter to `entity_subtype_desc = 'תכנית לתשתית לאומית'`** — the 142 procedural rows share `mp_id` families with the substantive ones and would create duplicate inserts.

### Plan-number format (verified)

| Pattern | Example | Notes |
|---|---|---|
| Bare base plan | `תתל/ 74` | Letters `תתל` (NO double-quote / gershayim), **literal space after every `/`** |
| Sub-plan | `תתל/ 65/ ב` | |
| Multi-level sub-plan | `תתל/ 16/ ב/ 1` | |

Stored in `pl_number` verbatim — preserve the trailing space when round-tripping. `resolvePlanCentroid` (`mastra/tools/urban-renewal-coords.ts:194-283`) already handles this format via the existing 4-step legacy fallback (attempt 2 tokenizes on `/` + whitespace).

### `mp_id` format

11-digit values in the `99005XXXXXX` block (e.g. `99005103346` for `תתל/ 74`), vs 7-digit `5000XXXXXX` for urban-renewal. The existing `MAVAT_SV4_MP_ID_REGEX = /\/SV4\/1\/(\d+)\/\d+/` in `scripts/sync-mavat.ts` handles both unchanged — `\d+` matches 11 as readily as 7.

### `station_desc` lifecycle enum (its own vocabulary)

For the 164 substantive plans:

| `station_desc` | Count | Stage |
|---|---:|---|
| `אישור` | 123 | Approved |
| `תסקיר סביבתי` | 26 | Environmental impact review |
| `דיון בהתנגדויות ותיקונים` | 6 | Objection hearings + revisions |
| `הגשת הערות והשגות` | 3 | Comments / observations period |
| `מילוי תנאים להערות והשגות` | 3 | Conditions for comments period |
| `העברה לממשלה לאחר אישור` | 2 | Post-approval cabinet handover |
| `בבדיקה תכנונית` | 1 | Under planning review |

**Critical: this is its own vocabulary — does NOT overlap with the urban-renewal enum** (`התכנית אושרה`, `בתוקף`, etc. never appear here). Treat as a separate stage map; do **not** reuse the urban-renewal `currentStage` mapping unchanged.

### Geometry comes back in WGS84 with `outSR=4326`

The single biggest finding from the 2026-04-26 probe: XPLAN returns full polygon geometry for תת"ל plans in WGS84 directly. No projection needed.

**Canonical fetch (production-ready):**

```bash
curl -G "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/1/query" \
  --data-urlencode "where=entity_subtype_desc = 'תכנית לתשתית לאומית'" \
  --data-urlencode "outFields=mp_id,pl_number,pl_name,pl_url,station_desc,internet_short_status,plan_county_name,district_name,last_update_date,depositing_date,receiving_date,pl_objectives,pl_landuse_string,pl_area_dunam" \
  --data-urlencode "returnGeometry=true" \
  --data-urlencode "outSR=4326" \
  --data-urlencode "f=json"
```

Response geometry shape (verified for `תתל/ 74`, Hadera general aviation airfield):

```json
{
  "geometry": { "rings": [[[34.873..., 32.456...], [34.874..., 32.457...], ... ]] },
  "spatialReference": { "wkid": 4326, "latestWkid": 4326 }
}
```

Single-ring polygon, 354 points, lon/lat order. Reshape ArcGIS `{rings: [...]}` to GeoJSON `{type: "Polygon", coordinates: [...]}` then ingest via the canonical PostGIS pattern from `scripts/sync-neighborhoods.ts`:

```sql
ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(${json}), 4326)))
```

### Single-plan probe by `pl_number`

```bash
curl -G "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/1/query" \
  --data-urlencode "where=pl_number = 'תתל/ 74'" \
  --data-urlencode "outFields=*" \
  --data-urlencode "returnGeometry=true" --data-urlencode "outSR=4326" --data-urlencode "f=json"
```

**Gotcha:** the `=` match WITH the literal trailing space round-trips correctly through ArcGIS REST query parsing — verified for `תתל/ 74`. If a particular plan ever fails, fall back to `pl_number LIKE 'תתל/ 74%'`.

### Coverage gaps in CKAN-side join keys

| Field | Hit rate | Implication |
|---|---|---|
| `national_transport.plan_link` containing `/SV4/1/{mp_id}/` | 31 of 152 active rows | The CKAN-side spine is broken; ingest from XPLAN directly and treat `plan_link` as a confidence-boost when present, not a primary join. |
| `plan_county_name` populated | ~76 of 200 sampled תת"ל rows | A corridor crosses many cities, so XPLAN frequently leaves county null. Geometry is the reliable scoping path. |

### Sample fixtures

Saved with the Phase-0 probe:

- [`fixtures/mavat-tatal/findings.md`](../fixtures/mavat-tatal/findings.md) — full probe writeup, 11 sections (counts, format, status enum, geometry, joins, reputation-rule analysis)
- [`fixtures/mavat-tatal/sample-tatal-74-xplan-attributes.json`](../fixtures/mavat-tatal/sample-tatal-74-xplan-attributes.json) — full attribute record for `תתל/ 74` (no geometry)
- [`fixtures/mavat-tatal/sample-tatal-74-xplan-geometry-trimmed.json`](../fixtures/mavat-tatal/sample-tatal-74-xplan-geometry-trimmed.json) — same plan with geometry shape preview (354-point ring trimmed to first 5 + last)

### When to also call SV4 (enrichment, opt-in)

XPLAN gives spatial + status + objectives. To get **decisions text, oppositions, meeting participants, plan documents**, the SV4 flow documented in [`mavat.md`](mavat.md) §2 is needed (reCAPTCHA + Playwright). The SV4 URL shape, mp_id regex, token refresh interval (~50 calls), and 1.5s inter-call delay are all unchanged for תת"ל. **One important difference**: `rsDesInvited` for תת"ל plans lists government agencies (NTA, רכבת ישראל, environmental consultants), not private developers — never run `extract-developers.ts` against `plan_kind = 'tatal_transit'`; gate that script on `WHERE plan_kind = 'urban_renewal'`.

### Reputation-rule compliance

- **Allowed**: `ST_Contains(boundary_geom_4326, ST_Point(lng, lat))` to attribute "the corridor passes through this address" — exact polygon-containment, gov-supplied geometry.
- **Allowed**: `ST_Intersects` between the corridor polygon and the building's `statistical_areas.geom` for the area-level "this corridor crosses the stat-area" claim.
- **Allowed**: exact `mp_id` join from a curated `tatal_line_label` lookup (`mp_id → "אדום" / "M1" / "ירוק"`) for display labels.
- **Forbidden**: surfacing line names by string-matching `pl_name` for `אדום` / `ירוק` — many corridor plans have geographic-only names (`תתל/ 74` is `שדה לתעופה כללית, חדרה`, not LRT-line-encoded).
- **Forbidden**: claiming "the developer of the corridor through your block is X" based on `rsDesInvited` participants — that's a meeting attendance list, not a project sponsor.

**Status:** **Shipped (2026-04-26).** `scripts/sync-mavat-tatal-xplan.ts` ingests all 164 substantive plans into `mavat_plan_data` with `plan_kind='tatal_transit'` + `boundary_geom_4326 geometry(MultiPolygon, 4326)` (GIST-indexed). Geometry pipeline wraps with `ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Force2D(...)), 3))` to repair hole-outside-shell self-intersections (observed on `תתל/ 64`). Idempotent UPSERT on `plan_number`; refreshes XPLAN-owned fields only on conflict (never blows away SV4 enrichment). Throws `MAVAT_TATAL_XPLAN_EMPTY` on 0-row result so regressions surface. Run: `pnpm sync:mavat:tatal`. Read path: `findTatalCorridorsForPoint({lat, lng, statAreaCode})` in `repositories/mavat-plan-data.ts` returns `matchType: "polygon_containment" | "stat_area_intersection"` per row; auto-folded into `scoreProject.nearbyTransitCorridors[]` as a *neighborhood* fact (NOT folded into the building-level `planningStage` factor — would double-count). SV4 enrichment optional via `sync-mavat.ts --kind tatal_transit` (not yet wired into the canonical pipeline).

---

## 4b. VATMAL — Declared Urban Renewal Complexes

```
GET https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/vatmal_mitchamim_muchrazim/MapServer/0/query
?where=yeshuv LIKE N'%בת ים%'&outFields=tamal_numb,mitham,yeshuv,mahoz,megish,area_plan,dunam_gis,yehidot,date_&f=json
```

**All 18 fields (verified 2026-04-10).** We fetch 9 of 18:

| Field | Type | Meaning | Fetched? |
|-------|------|---------|----------|
| `tamal_numb` | String | VATMAL complex number | ✅ |
| `mitham` | String | Complex name | ✅ |
| `yeshuv` | String | City | ✅ |
| `mahoz` | String | District | ✅ |
| `megish` | String | **Submitter** (often "רמ"י" or "רשות מקומית", sometimes private dev) | ✅ |
| `area_plan` | Double | Planned area (from declaration) | ✅ |
| `dunam_gis` | Double | GIS-calculated area (dunams) | ✅ |
| `yehidot` | Integer | Housing units | ✅ |
| `date_` | Date | Declaration date (epoch) | ✅ |
| `area_gis` | Double | GIS-calculated area (sqm) | ❌ |
| `update_dat1` | Date | Declaration update date 1 | ❌ |
| `update_dat2` | Date | Declaration update date 2 | ❌ |
| `update_dat3` | Date | Declaration update date 3 | ❌ |
| `tama_deviation` | Date | TAMA deviation approval date | ❌ |
| `Shape`, `Shape_Length`, `Shape_Area` | Geometry | Polygon geometry | ❌ (spatial query possible but not used) |

**Query method:** Spatial point-in-polygon. Pass WGS84 lat/lng as the geometry with `geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` — ArcGIS reprojects to the layer's native EPSG:2039 server-side. City-wide text search on `yeshuv` is intentionally NOT used: declared-complex name/submitter/units/declarationDate are identifying facts about a specific building, so attribution must key on spatial containment (reputation rule).

**Integrated in:** `mastra/tools/vatmal-queries.ts` → `queryVatmalByPoint({lat,lng})`. Called from the shared `gatherAddressSources` orchestrator after the Govmap autocomplete coord is converted from Web Mercator (EPSG:3857) to WGS84 via `govmapToWgs84`.
