---
name: government-data-sources
description: Comprehensive reference for all Israeli government APIs and data sources used in Dirot — Govmap REST (5 endpoints), XPLAN ArcGIS (50-field schema, 5 layers), VATMAL (18 fields), Shimour (3 layers), Plan Annexes (29 fields, 44 doc categories), data.gov.il CKAN (22 resources), MAVAT/iplan (reverse-engineered), apps.land.gov.il (plan PDFs), Complot SOAP (27 ops behind 5 municipal sites — local-committee meetings, issued permits, dangerous-building files), and 84 ArcGIS Online services including 5 high-value unintegrated sources: Housing Complexes (9.8K records, PB type tagging), Building Age 1950-1980 (68K buildings), Implementation layer (18K lots), Housing Mix (124 CBS fields), Environmental Sensitivity. Use whenever adding data sources, integrating APIs, researching available data, debugging API responses, looking up field names/endpoints, or planning data features. Also use when the user asks "where can we get X data", "what APIs do we have", "what fields does XPLAN have", or "what's not integrated yet".
---

# Government Data Sources — Complete API & Dataset Reference

Every external data source Dirot uses or can use. This SKILL.md is the **navigation layer** — each source's endpoints, field names, gotchas, and integration notes live in per-source files under `references/`. Read only the references you need.

## Source Overview

| Source | Base URL | Auth | Integrated? | Reference |
|--------|----------|------|-------------|-----------|
| **Govmap REST** | `govmap.gov.il/api` | None | Yes (5 endpoints) | [`references/govmap.md`](references/govmap.md) |
| **MAVAT/iplan SV4** | `mavat.iplan.gov.il` | reCAPTCHA v3 | **Partial** (bulk-extracted via Playwright to `mavat_plan_data` table; live queries still need reCAPTCHA) | [`references/mavat.md`](references/mavat.md) |
| **MAVAT PublishingTextAPI** | `mavat.iplan.gov.il/PublishingTextAPI` | **None!** | **Yes** (queries + tools) | [`references/mavat.md`](references/mavat.md) |
| **XPLAN ArcGIS** | `ags.iplan.gov.il/.../Xplan` | None | Yes (37 of 50 fields) | [`references/xplan-vatmal.md`](references/xplan-vatmal.md) |
| **XPLAN — תת"ל corridor plans (subset)** | same XPLAN Layer 1, filter `entity_subtype_desc='תכנית לתשתית לאומית'` | None | **Yes** (2026-04-26) — 164/164 substantive plans ingested into `mavat_plan_data` with `plan_kind='tatal_transit'` + WGS84 `boundary_geom_4326`. Sync via `pnpm sync:mavat:tatal`. SV4 enrichment (decisions / oppositions / participants) is an optional opt-in via `sync-mavat.ts --kind tatal_transit` — not yet wired as its own pnpm script. | [`references/xplan-vatmal.md`](references/xplan-vatmal.md) §4c · [`fixtures/mavat-tatal/findings.md`](fixtures/mavat-tatal/findings.md) |
| **VATMAL ArcGIS** | `ags.iplan.gov.il/.../vatmal_mitchamim_muchrazim` | None | Yes (9 of 18 fields) | [`references/xplan-vatmal.md`](references/xplan-vatmal.md) |
| **data.gov.il CKAN** | `data.gov.il/api/3` | None | Yes (20 of 22 resources synced) | [`references/ckan.md`](references/ckan.md) |
| **ICA Companies Registry (רשם החברות, CKAN)** | `data.gov.il/api/3` | None | **No** — probed 2026-04-23; SPV-pattern blocks naive name→ח.פ backfill | [`references/ckan.md`](references/ckan.md) §6 |
| **`data.nadlan.gov.il` (Tax Authority bulk JSON)** | `data.nadlan.gov.il/api` | **None** for aggregate + index endpoints; **reCAPTCHA v3** for per-deal `/api/deals/...` | **Partial** — `getCityInfo()` live-query wired 2026-04-20 (`mastra/tools/knowledge/city-info.ts`); other endpoints evaluated + skipped | [`references/nadlan-bulk.md`](references/nadlan-bulk.md) |
| **CKAN `helkot.zip` (national cadastre)** | `e.data.gov.il/dataset/.../helkot.zip` | **IAP allow-list** (sefia@cio.gov.il grants) | **Planned** (file at `data/helkot.zip`, schema verified 2026-04-18) | `fixtures/parcels-cadastre/findings.md` |
| **CKAN `gis_urban_renewal` shapefiles** | `e.data.gov.il/dataset/.../masterplans.zip` + `.../officiallydeclaredprojects.zip` | **IAP allow-list** | **No** — 99% overlap with existing `urban_renewal` + VATMAL (2026-04-18 verified) | `fixtures/gis-urban-renewal/findings.md` |
| **Land Authority PDFs** | `apps.land.gov.il` | None | **No** (need PDF ID mapping) | [`references/land-authority-pdfs.md`](references/land-authority-pdfs.md) |
| **Shimour (Conservation)** | `ags.iplan.gov.il/.../Shimour` | None | **Yes** (`shimour-queries.ts`) | [`references/arcgis-online.md`](references/arcgis-online.md) |
| **Plan Annexes FS** | `services2.arcgis.com/.../MipuiMN_FINAL` | None | **Yes** (`plan-annexes-queries.ts`) | [`references/arcgis-online.md`](references/arcgis-online.md) |
| **ArcGIS Online (84 services)** | `services2.arcgis.com/9xNzs4HrnCQY9yx4` | None | Partial (Metro, Plan Annexes, Socioeconomic) | [`references/arcgis-online.md`](references/arcgis-online.md) |
| **iplan ArcGIS (45 services)** | `ags.iplan.gov.il/arcgisiplan` | None | Partial (Xplan, Shimour, VATMAL) | [`references/arcgis-online.md`](references/arcgis-online.md) |
| **Complot SOAP** | `handasi.complot.co.il/wsComplotPublicData/ComplotPublicData.asmx` | None | **No** (fully probed, not wired) | [`references/municipal.md`](references/municipal.md) |
| **Holon Minhelet** | `minhelet-holon.co.il` | None | **Yes** (Phase 1, RSS scraper) | [`references/municipal.md`](references/municipal.md) |
| **Bat Yam Municipal Protocols** | `bat-yam.muni.il/protocols/` | None | **No** | [`references/municipal.md`](references/municipal.md) |
| **LRT/Metro opening dates** | Authoritative override table in code | — | Yes (`line-overrides.ts`) | [`references/lrt-metro-dates.md`](references/lrt-metro-dates.md) |
| **Train Stations** | Static seed (better-rail, MIT) | None | **Yes** (`data/train-stations.ts`) | — |
| **Haifa Carmelit funicular** (operator nav) | `carmelithaifa.co.il` | None | **Yes** (2026-04-26) — 6 stations seeded into `lrt_stations` via `pnpm seed:carmelit`. Operator nav surprise: Hebrew nav uses post-2018 current names (`עיר תחתית` / `הדר עירייה` / `הנביאים` / `מסדה` / `בני ציון` / `מרכז הכרמל`); English nav uses pre-2018 historical names (Paris Square / Solel Boneh / etc.). We seed the post-2018 names — operator's signs today say those. | [`references/lrt-metro-dates.md`](references/lrt-metro-dates.md) |
| **CBS Socioeconomic** | `services2.arcgis.com/.../SOEC_Stat11_2021` | None | **Yes** (`sync-socioeconomic.ts`) | [`references/arcgis-online.md`](references/arcgis-online.md) |

## Data Source Matrix — What Can We Find Where?

| Data Point | Govmap | XPLAN | CKAN | VATMAL | MAVAT (bulk DB) | Plan PDF | ArcGIS Online | Nadlan bulk | ICA Companies |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Transaction prices (per deal) | x | | | | | | | (reCAPTCHA) |
| Gush/Helka | x | | | | x | | | |
| Ownership type | x | | | | | | | |
| Zoning | x | x (Layer 4) | | | | x | | |
| Planning entities | x | x | | | | | | |
| PB project status | | x | x | | | | **x** (Housing Complexes) | |
| Unit counts | | x | x | x | x | x | **x** (Housing Complexes) | |
| Plan timeline (11 dates) | | **x** | | | x (17 stages) | | | |
| Building program (13 qty) | | **x** | | | x | | | |
| **Developer/submitter** | | (objectives) | x (executor) | **x (megish)** | x (participants) | **x (יזם)** | **x** (SUBMITTER_NAME) | | |
| **Company registration + status (ח.פ)** | | | | | | | | | **x** (name, status, liquidation, violator flag — lookup by ח.פ, NOT name — SPV caveat) |
| Contractor sanctions | | | x | | | | | |
| **Objections** | | | | | **x (MAVAT)** | | | |
| **Committee decisions** | | | | | **x (MAVAT)** | | | |
| Plan annexes/documents | | | | | **x (MAVAT)** | x | **x** (Plan Annexes FS) | |
| Economic opinion | | | | | x | | **x** (Plan Annexes FS) | |
| Demographics | x | | | | | | **x** (Housing Mix 124 fields) | **x** (income, academics, sector) |
| Neighborhood | x | | | | | | | **x** (PolyNeighSett crosswalk, 205K) |
| Architect | | | | | x | x | | |
| Price trends (aggregate, city/neigh) | x | | | | | | | **x** (10yr quarterly median by room count) |
| Price indices (luxury, yield, 1st/2nd-hand) | | | | | | | | **x** (RealEstateIndices, 12 indices) |
| Conservation status | | **Shimour** | | | | | | |
| **Building age** | | | | | | | **x** (68K buildings 1950-1980) | |
| **Building density (Low/Med/High)** | | | | | | | | **x** (HighBuilding) |
| Walking distance to parks/schools | | | | | | | | **x** (WalkingAvgDistance, pre-computed) |
| Green-area coverage | | | | | | | | **x** (sum + pct + count) |
| Parks / public gardens (with coords) | | | | | | | | **x** (gardensAndParks[]) |
| Kids gardens / schools (per city) | | | | | | | | **x** (kidsGardensAndSchools) |
| Clinics / community centers / religion | | | | | | | | **x** (community) |
| Stores / pharmacies (per city) | | | | | | | | **x** (arrangements) |
| Property-type code dictionary (58 codes) | | | | | | | | **x** (dealNatureIndex) |
| **Lot realization status** | | | | | | | **x** (Implementation layer) | |
| **Env sensitivity** | | | | | | | **x** (Sensitivity grading) | |
| **PB type (new/renewal)** | | | | | | | **x** (Housing Complexes) | |

## Coordinate Systems

| System | Format | Used By | Conversion |
|--------|--------|---------|-----------|
| **ITM** (Israeli Transverse Mercator, EPSG:2039) | x, y (meters, ~180K/690K) | LRT stations source data (backfilled to WGS84) | proj4 EPSG:4326↔2039 |
| **EPSG:3857 Web Mercator** | mercX, mercY (~3.8M/3.8M) | **Govmap autocomplete `shape` output**, **Govmap `entitiesByPoint`**, **Govmap `/real-estate/deals/{x,y}/{r}`** (polygon discovery) | proj4 EPSG:4326→3857 |
| **WGS84** | lat, lng (degrees) | Bus stops, schools, statistical areas, Metro stations, train stations, ArcGIS `outSR=4326` | — |

**2026-04-19 correction** — Govmap's `/api/real-estate/deals/{x},{y}/{radius}` polygon-discovery endpoint uses **EPSG:3857 Web Mercator**, NOT ITM as previously documented. Our `sync-govmap.ts` works correctly because it passes the `shape` coords verbatim from `autocompleteAddress()` (which returns Mercator). Hand-converting to ITM with `wgs84ToItm()` and calling that endpoint returns 0 polygons silently. Use autocomplete's `shape` output directly, or proj4 EPSG:4326→3857.

Conversion helpers live in `mastra/tools/scoring-proximity.ts`: `wgs84ToItm()`, `itmToWgs84()`. The `itmToWgs84` function is a 2-parameter linear approximation tuned for relative distance math within the app — it is **NOT** a real EPSG:2039↔WGS84 converter. For live XPLAN/ArcGIS queries, always pass `outSR=4326` so the server returns WGS84 directly; never convert ITM client-side.

## Known Mismatches and Naming Traps (read before querying)

### CBS polygon vs CBS socio code: version mismatch (CRITICAL)

Our `statistical_areas` table (3,857 polygons, synced 2022) uses **CBS 2022 stat_area codes** (e.g. 111-534 + new 6xx-7xx for re-partitioned areas). Our `socioeconomic_index` table (2,885 rows) uses **CBS 2011 stat_area codes** from SOEC_Stat11_2021 (only 111-534 range, no 6xx-7xx).

Same physical coordinate returns two different codes:
- Our `findStatAreaContainingPoint({lat,lng})` → `633` (2022 code, from our polygons table)
- Govmap's `statistic_areas_2011` layer at same point → `355` (2011 code, matches our socio data)

**Effect**: Any location in a newly-split 2022 polygon (6xx/7xx codes) silently drops socio-cluster data — even though the data exists in our DB under the 2011 code. Netanya has 15 such polygons (20%).

**Fix direction**: Either resync `statistical_areas` from CBS 2011 source (matches socio), OR build a `stat_area_2022_to_2011` mapping table, OR query Govmap's `statistic_areas_2011` layer for the 2011 code at lookup time.

### Plan name ≠ neighborhood name ≠ stat_area name

Three different government sources use three different labels for the same place:
- **CKAN `urban_renewal.shem_mitcham`** = the **plan's historical name** (e.g. "הרומנים" — "the Romanians", for an immigrant-era neighborhood)
- **Govmap `neighborhoods` layer** = current **marketing/administrative neighborhood name** (e.g. "כוכב הים" for the same area)
- **Govmap deal record `neighborhood` field** = **market-quarter label** (e.g. "מחנה יעקב", "מע"ר - מרכז עירוני ראשי" — these are tax-authority market zones)
- **CBS `area_name`** = **statistical rubric** (e.g. "רובע 6/63")

These do NOT align. Filtering `govmap_deals.neighborhood ILIKE '%הרומנים%'` will return 0 rows even when the plan area has 1,500+ deals — because Govmap never uses "הרומנים". Always resolve location by **coordinates** (ST_Contains / radius), never by neighborhood string matching CKAN names against Govmap records.

### Govmap sync coverage gap (sync-govmap.ts seed points)

`scripts/sync-govmap.ts` seeds each of 15 cities with 2-5 manually-picked search points (e.g. Netanya: "נתניה", "עיר ימים נתניה", "קריית נורדאו נתניה"). Each seed runs `getDealsByRadius(..., 2000m)` then keeps only top 10 polygons by `dealscount` (`MAX_POLYGONS_PER_AREA=10`). Result: entire neighborhoods away from the seed points are never ingested.

**Confirmed gap (Netanya, 2026-04-19)**: 176 polygons / 1,559 deals around the הרומנים/מחנה יעקב/כוכב הים area never synced. This is a **seed coverage problem**, not a data availability problem.

**Fix direction**: Raise `MAX_POLYGONS_PER_AREA`, expand seed points to include every known neighborhood per city, OR use an exhaustive grid scan per city bounding box instead of neighborhood-centered seeds.

## Not Yet Integrated — Future Data Sources

| Source | What It Could Provide | Blocker | Priority | Reference |
|--------|----------------------|---------|----------|-----------|
| **CKAN `helkot.zip` cadastre** | Every registered parcel in Israel — gush+helka+polygon+legal_area, monthly updates, 667 MB shapefile | None — open download; requires PostGIS import + GiST index | **Critical** (2026-04-18 re-assessment) | `fixtures/parcels-cadastre/findings.md` |
| **Building Age 1950-1980** | 68K building polygons with MIN_B_year — **no identifiers**, requires spatial join to `helkot.zip` cadastre | Depends on cadastre ingest above | **High** (blocked by cadastre) | `arcgis-online.md` §7b |
| **Housing Complexes** | 3,747 PB polygons nationwide with plan_number + FLAT_NUMBER + PLAN_STATUS. **SUBMITTER_NAME is a committee code, NOT a developer.** MP_ID does NOT join our mavat_plan_data. Real join key is PLAN_NB. | None — but lower value than initially scoped (2026-04-18 re-probe) | **Medium** (address→plan only; not developer) | `fixtures/housing-complexes/findings.md` |
| **Implementation Layer** | ~~18K lots~~ **Gaza Envelope only — 100% Southern District** (misread 2026-04-10, corrected 2026-04-20). 0 plan-number matches to our urban_renewal or mavat. See `arcgis-online.md` §7c for full probe results. | Wrong geographic scope — not actionable for metro-focused PB scoring | **Skip** (no national equivalent exists as of 2026-04-20) | `arcgis-online.md` §7c |
| **Govmap per-city building layers** | Floors+units in Be'er Sheva (211848), Nes Tziona (212061), Golan (214047). **No year_built anywhere in 808 layers.** | None — add to PROPERTY_LAYERS | **Low-Med** (3 cities only) | `fixtures/govmap-entities/findings.md` |
| **MAVAT SV4 API (live)** | Objections, decisions, participants, plan documents | reCAPTCHA v3 token (browser needed) | High | `mavat.md` §2 |
| **Complot SOAP** (5 cities) | Local-committee meetings, issued permits, dangerous-building files | 5 input contracts unsolved; no plan→address mapping | **High** | `municipal.md` §12 |
| **Bat Yam Municipal Protocols** | Full meeting minutes PDFs | Need scraping + PDF parsing | **High** | `municipal.md` §13 |
| **Housing Mix (CBS)** | 124 fields: demographics, apartment sizes by stat area | None | Medium | `arcgis-online.md` §7d |
| **Land Authority PDFs** | Developer names, architects, regulations | Need PDF file ID mapping | Medium | `land-authority-pdfs.md` |
| **Env Sensitivity** | Ecological/visibility sensitivity per landscape unit | None | Low-Med | `arcgis-online.md` §7e |
| **Govmap Layer 13 / 15** | 2022 stat areas / all parcels with status | None — just add to layer list | Low | `govmap.md` §1.5 |
| **Nadlan bulk — `/api/deals/...` per-deal** | Individual deal records per settlement/neighborhood/street/asset | **reCAPTCHA v3** via `api.nadlan.gov.il/token-verify` (same barrier as MAVAT) | Medium (blocked — currently covered by Govmap) | [`references/nadlan-bulk.md`](references/nadlan-bulk.md) |
| **ICA Companies Registry (רשם החברות)** | Company name / status / liquidation / violator / registered address / incorporation date, keyed by ח.פ | **No auth**, but **name→ח.פ resolution is fundamentally ambiguous** because every PB developer operates per-project SPVs (e.g. "בוני התיכון" → 69 distinct SPV rows). Useful only when ח.פ is already known. | Medium — enables developer-health risk signals (liquidation, מפרה) when ח.פ is known; DO NOT use for name→ח.פ attribution | [`references/ckan.md`](references/ckan.md) §6, `fixtures/companies-registry/findings.md` |

### Nadlan bulk — evaluated + decided (2026-04-20)

| Endpoint | Verdict | Why |
|---|---|---|
| `additional_info/settlements/{semel}.json` | **Wired as live-query** (`mastra/tools/knowledge/city-info.ts`) | Rich per-city metadata (12 price indices, walking distances, density, demography). Live-query + 24h cache beats bulk sync because the data is 3 MB per city, regenerates monthly, and we only consume a handful of scalars. |
| `pages/settlement/buy\|rent/{semel}.json` | **Skipped** | 10yr quarterly medians are derivable from our own `govmap_deals` via `DATE_TRUNC('quarter', …)`. No need to duplicate. If it becomes a hot path, add a sibling live-query helper. |
| `index/PolyNeighSett.json` | **Skipped** | 205K polygon→neighborhood→semel crosswalk. Our `govmap_deals.stat_city_code` (87% coverage) + `statistical_areas` spatial joins cover the cases we have. Revisit if neighborhood-level filtering becomes a scoring factor. |
| `index/dealNatureIndex.json` | **Skipped** | 58 property-type codes. Our `govmap_deals.property_type` already stores normalized Hebrew (16 distinct values on 164K rows). Marginal value. |

## How to use this skill

1. **Starting with a question?** Scan the Source Overview + Data Source Matrix above to pick the right source.
2. **Integrating a source?** Open the matching `references/*.md` for the full endpoint, field schema, and gotchas. Don't trust training-data memory of these APIs — the gotchas (F5 WAF empty-body, ITM vs WGS84, legacy `בי/` plan matching) are what break integrations.
3. **Adding a new source?** Create a new `references/<source>.md` and add one row to the Source Overview table here. Keep this SKILL.md itself under ~300 lines — it's the index, not the encyclopedia.
