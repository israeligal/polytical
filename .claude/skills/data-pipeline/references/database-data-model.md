# Database Data Model — Full Table Reference

**Last verified**: 2026-04-19 against Aiven production DB (pg-matama-19391830)
**Scope**: All domain tables — schema, row counts, city-code coverage, JSONB structure, verified samples

Everything here is **directly queried from the DB**, not inferred from schema.ts. Use this as the source of truth when building new joins, sync scripts, or repository functions.

---

## Universal join key: CBS `semel_yishuv`

**Critical finding (2026-04-19)**: Every major domain table already carries the CBS numeric city code with 100% coverage. This eliminates the spelling-variant problem — never join on city name, always on the numeric code.

| Table | Column | Type | Coverage | Example for Tel Aviv |
|---|---|---|---|---|
| `urban_renewal` | `semel_yeshuv` | `integer` | 906/906 | `5000` |
| `statistical_areas` | `city_code` | `text` | 3,857/3,857 | `"5000"` |
| `socioeconomic_index` | `city_code` | `integer` | 2,885/2,885 | `5000` |
| `bus_stops` | `city_code` | `integer` | 33,927/33,927 | `5000` |
| `parcels` | `locality_id` | `integer` | 1,094,533/1,094,533 | `5000` |
| `govmap_deals` | `stat_city_code` | `text` | 34,643/39,963 (86.7%) | `"5000"` |

**Name spelling varies, code doesn't**: for code 5000, parcels says `תל אביב -יפו`, stat_areas says `תל אביב -יפו`, urban_renewal says `תל אביב יפו` (old CKAN spelling). All three refer to the same municipality.

**Tables WITHOUT numeric city code** (string-keyed only):
- `contractors.shem_yishuv` (Tax Authority export)
- `brokers.city`, `appraisers.city` (user-submitted free-text)
- `active_construction.city_name` (CKAN export)
- `green_buildings.municipality_name` (Construction Ministry export)
- `public_housing_inventory.city_lms_name`
- `buildings.city_name` (with `stat_city_code` column but not yet populated)

---

## Table catalog

### Core domain tables (user-facing data)

| Table | Rows | Purpose | City key | Coord? |
|---|---|---|---|---|
| `urban_renewal` | 906 | CKAN PB projects | `semel_yeshuv` | lat/lng (76%) |
| `mavat_plan_data` | 774 | MAVAT bulk extract (17-stage timeline, participants, oppositions) | `plan_addresses.CITY_COUNTY_CODE` (JSONB) | via plan_addresses |
| `govmap_deals` | 39,963 | Real estate transactions (Govmap) | `stat_city_code` | lat/lng (87%) |
| `parcels` | 1,093,470 | National cadastre (gush+helka+centroid) | `locality_id` | centroid_lat/lng 100% |
| `buildings` | 1,807 | Per-building facts (Netanya mitham seed) | `city_name` + `stat_city_code` | via cadastre |
| `statistical_areas` | 3,857 | CBS 2022 polygons (geography) | `city_code` | geom + centroid |
| `socioeconomic_index` | 2,885 | CBS 2011 socio cluster | `city_code` + `stat_area_code` (2011!) | — |
| `municipal_projects` | 9 | Phase 1 Holon committee scrape | `source_city` | — |

### Transit / infrastructure

| Table | Rows | Purpose | Coord |
|---|---|---|---|
| `bus_stops` | 33,927 | National bus stations | WGS84 lat/lng |
| `lrt_stations` | 332 | Light rail stations (all lines, all statuses) | ITM x/y + WGS84 lat/lng |
| `lrt_lines` | 27 | Light rail lines metadata | — |
| `metro_stations` | 109 | M1/M2/M3 stations | WGS84 |
| `train_stations` | 66 | Israel Railways | WGS84 |
| `mass_transit` | 32 | BRT routes | shape_length |
| `tma3_roads` | 4,513 | National road plan polygons | shape |
| `tma23_rail` | 229 | National rail plan polygons | shape |
| `national_transport` | 152 | Transportation plans with MAVAT links | — |
| `transport_projects` | 448 | In-progress transport megaprojects | — |

### Supporting data

| Table | Rows | Purpose |
|---|---|---|
| `contractors` | 23,915 | Government contractor registry (Kablanim) — no coord, just city+street |
| `brokers` | 29,072 | Licensed real estate brokers (user-submitted city) |
| `appraisers` | 3,087 | Licensed property appraisers |
| `active_construction` | 10,298 | Active construction sites (CKAN) |
| `construction_progress` | 10,371 | Construction milestone tracking (stage_X_date serial numbers) |
| `green_buildings` | 7,304 | Green building certifications |
| `schools` | 28,312 | National school registry — **city_name is empty for all rows**; use lat/lng only |
| `lottery` | 2,352 | Dira BeHanacha lottery data |
| `development_costs` | 1,696 | Per-project development fees |
| `public_housing_inventory` | 879 | Public housing units by city + floor + room count |
| `public_housing_vacancies` | 1,115 | Public housing vacancies |

### User / infra

| Table | Rows | Purpose |
|---|---|---|
| `saved_properties` | 1 | User's saved property list |
| `user_preferences` | 1 | Investor profile fields |
| `early_access_signups` | 14 | Waitlist signups |
| `property_snapshots` | 0 | Monitoring cron state (XPLAN change detection) |
| `property_alerts` | 0 | Per-user property alerts |
| `message_feedback` | 0 | Agent feedback (empty in current env) |
| `govmap_api_log` | 1,126 | Govmap API call audit trail |

---

## Critical JSONB structures (sampled from live DB)

### `mavat_plan_data.plan_addresses` — array of address records

```json
[
  {
    "PLAN_AREA": "מורדות הכרמל",
    "JURST_AREA": "טירת כרמל",
    "CITY_COUNTY": "טירת כרמל",
    "STREET_CODE": 113,
    "STREET_NAME": "אצ\"ל",
    "HOUSE_NUMBER": "1",
    "DISTRICT_AREA": "חיפה",
    "PLAN_AREA_CODE": 355,
    "JURST_AREA_CODE": 2100,
    "CITY_COUNTY_CODE": 2100,
    "DISTRICT_AREA_CODE": 3
  }
]
```

**Key takeaway**: MAVAT uses **semel_yishuv** as `CITY_COUNTY_CODE` AND `JURST_AREA_CODE` — same CBS system as every other table. Plan addresses carry both numeric code and Academy-standard Hebrew name, so MAVAT is **Academy-spelling**, unlike CKAN.

### `mavat_plan_data.blocks` — array of gush/parcel references

```json
[
  {
    "BLOCKS": "10143",
    "BLOCK_TYPE": "מוסדר",
    "PARCELS_WHOLE": "68 - 70, 72, 90",
    "PARCELS_PARTIAL": "",
    "BLOCK_PARTIALITY": "חלק",
    "BLOCK_PARTIALITY_CODE": "ח"
  }
]
```

Use `BLOCKS` = gush number, `PARCELS_WHOLE` + `PARCELS_PARTIAL` = helka list. Handy for joining plans to our 1M+ `parcels` table.

### `mavat_plan_data.timeline` — 17-stage processing sequence

```json
[
  {
    "DETAILS": "תאריך פרסום: 15/02/2026.  מס' ילקוט פרסומים: 14257.  עמוד: 3943. ...",
    "EIS_DATE": "15/02/2026",
    "LIS_CODE": 4400,
    "LIS_DESC": "פרסום להפקדה ברשומות",
    "EIS_ENTITY_ID": 3005522662,
    "FINAL_ROWNUMBER": 1,
    "ED_PUBLICATION_FILE": 14257,
    "STATUS_PRINT_VERSION": 47,
    "STATUS_TASRIT_VERSION": 16
  }
]
```

Already surfaced as `committeeActivity.timeline[]` in scoreProject output.

### `mavat_plan_data.quantities` — building program (units, sqm)

```json
[
  {
    "ID": 3001799753,
    "REMARK": "מתוך סה\"כ הדירות",
    "ROW_NUM": 1,
    "UNIT_DESC": "יח\"ד",
    "LAST_UPDATE": "05/02/2026 10:51",
    "LAST_UPDATER": "tali",
    "DETAILED_PLAN": null,
    "QUANTITY_CODE": 150,
    "QUANTITY_DESC": "דירות קטנות (יח\"ד)",
    "IMPLEMENTATION": "91",
    "AUTHORISED_QUANTITY": null,
    "AUTHORISED_QUANTITY_ADD": "+91"
  }
]
```

### `mavat_plan_data.documents` — linked PDF/attachment files

```json
[
  {
    "ID": 3001134845643,
    "ORD": 250,
    "DOC_NAME": "בדיקת הצללה",
    "RUB_CODE": 250,
    "RUB_DESC": "מסמכים חתומים",
    "DOC_PAGES": 36,
    "FILE_DATA": {
      "edId": null,
      "edNum": "DAE0987B...",
      "ficon": "ft/file_PDF.gif",
      "fname": "DOC_3001134845643.pdf",
      "attExist": true
    },
    "FILE_TYPE": "pdf       ",
    "DOC_PAGE_NO": 0,
    "ED_DOC_INFO": "חתום להפקדה",
    "EDITING_DATE": "09/02/2026"
  }
]
```

### `mavat_plan_data.opposition_analysis` — Haiku-classified oppositions (post-PDF analysis)

```json
{
  "files": [
    {
      "summary": "תאריך 07.11.2024",
      "concerns": ["infrastructure", "transit"],
      "filename": "410-0856021_....pdf",
      "classification": "opposition_letter"
    }
  ]
}
```

8 concern categories: `heritage`, `environmental`, `traffic`, `density`, `infrastructure`, `social`, `property_rights`, `transit`.

### `municipal_projects.design_team` — Holon Phase 1.5 enrichment

```json
{
  "appraiser": { "firm": "רוזנטל אדריכלות ויעוץ נדל\"ן", "name": null },
  "architect": { "firm": "גורדון אדריכלים ומתכנני ערים בע\"מ", "leadName": null },
  "trafficEngineer": { "firm": "ש. קרני מהנדסים בע\"מ" },
  "programConsultant": { "firm": "סיטילינק השקעות בע\"מ" },
  "projectManagement": { "firm": "סיטילינק השקעות בע\"מ" }
}
```

### `municipal_projects.source_documents` — ingested PDFs

```json
[
  {
    "url": "https://www.minhelet-holon.co.il/.../Holon_Booklet_Digital-....pdf",
    "docDate": "2023-09-01",
    "docType": "booklet",
    "filename": "Holon_Booklet_Digital-....pdf",
    "charCount": null,
    "fetchedAt": "2026-04-18T09:00:05.422Z",
    "sizeBytes": 5105858,
    "extractionStatus": "skipped_date"
  }
]
```

### `buildings.sources` — provenance chain

```json
[
  {
    "source": "netanya_mitham_card",
    "fetchedAt": "2026-04-18T17:40:19.617Z",
    "rawValues": {
      "notes": null,
      "rawAddress": "ברקת 10",
      "mithamNumber": 77,
      "sourceTableIndex": 2
    },
    "sourceRowId": "mitham-77-row-0",
    "fieldsContributed": []
  }
]
```

---

## Sample rows — key tables

### `urban_renewal` (CKAN PB projects)

```
id                | 1
mispar_mitham     | 4001
yeshuv            | גבעתים           ← CKAN old spelling
semel_yeshuv      | 6300              ← CBS code (canonical)
shem_mitcham      | ערבי נחל
yachad_kayam      | 126               ← existing units
yachad_tosafti    | 108               ← additional
yachad_mutza      | 530               ← total proposed
taarich_hachraza  | 20/08/2006
mispar_tochnit    | גב/490
kishur_latar      | https://mavat.iplan.gov.il/SV4/1/5073314/310
kishur_la_mapa    | https://www.govmap.gov.il/...
sach_heterim      | 530
maslul            | מיסוי              ← taxation route
shnat_matan_tokef | 2012              ← year approved
bebitzua          | לא                 ← under construction?
status            | תכנית מאושרת - אחרי רישוי
lat               | NULL              ← 76% coverage
lng               | NULL
stat_area_code    | NULL              ← 76% coverage
stat_city_code    | NULL
```

### `contractors` (Kablanim registry)

```
id                     | 1
shem_yeshut            | רובין אברהם
mispar_kablan          | 6866
shem_yishuv            | תל אביב -יפו   ← Academy spelling
shem_rehov             | חת"ם סופר
taarich_kablan         | 1983-10-16
mispar_tel             | 526955965
email                  | office@a-rubin.co.il
kod_anaf               | 100            ← sector code
teur_anaf              | בניה
kvutza                 | ג              ← classification group
sivug                  | 1              ← classification level
hekef                  | 5058           ← capacity score
kablan_mukar           | לא מוכר        ← recognized? "כן" or "לא מוכר"
ovdim                  | רובין אברהם
shem_yeshut_normalized | רובין אברהם   ← pg_trgm-indexed normalized name
```

### `parcels` (national cadastre)

```
id             | 187054
parcel_ext_id  | 190611
gush           | 8244
helka          | 143
sub_helka      | ''                    ← empty for most
centroid_lat   | 32.308434             ← always populated
centroid_lng   | 34.85706
legal_area_sqm | 500
status_text    | מוסדר                 ← "registered"
city_name      | נתניה
reg_mun_name   | ''                    ← often empty
county_name    | השרון
region_name    | המרכז
stat_area_code | NULL                  ← NEVER populated yet
stat_city_code | NULL                  ← NEVER populated yet
```

**Note**: `parcels.stat_area_code` and `stat_city_code` are defined in schema but never backfilled. 1M+ rows all NULL. This is a planned backfill.

### `statistical_areas` (CBS 2022 polygons)

```
id             | 1720
city_code      | 7400               ← CBS semel_yishuv
stat_area_code | 415                ← CBS 2022 code
city_name      | נתניה
area_name      | רובע 4/41           ← "Quarter 4/41"
population     | NULL                ← always NULL in our sync!
centroid_lat   | 32.285885
centroid_lng   | 34.841198
```

**Issue**: `population` is NULL for all 3,857 rows — our sync doesn't populate it. CBS publishes population separately in the socioeconomic feed.

### `socioeconomic_index` (CBS 2011 socio cluster)

```
id             | 1
city_code      | 97                  ← CBS semel_yishuv
stat_area_code | 1                   ← CBS 2011 code (NOT 2022!)
cluster        | 8                   ← 1-10
index_value    | NULL                ← usually empty
population     | 671                 ← has pop here
synced_at      | 2026-04-03
```

**CRITICAL**: This table uses **CBS 2011 stat_area_code system**. `statistical_areas` uses **2022**. Same coord returns different codes across tables — 972 of 3,857 polygons have no matching socio row because they're new (6xx/7xx) 2022 codes with no 2011 equivalent.

### `govmap_deals`

```
object_id      | 2209350
deal_amount    | 427000
deal_date      | 1998-02-22
property_type  | דירה
rooms          | 3
area_sqm       | 80
floor          | רביעית
settlement     | נתניה
street         | שניאור זלמן         ← 42% of rows (58% NULL)
house_number   | 31
neighborhood   | קריית נורדאו
price_per_sqm  | 5338
polygon_id     | 7959-86             ← usually gush-helka; 19 polygons use legacy 8-digit format
lat            | 32.28393            ← 87% populated (backfilled)
lng            | 34.850235
gush_num       | 7959                ← 87% populated
parcel_num     | 86
stat_area_code | 521                 ← CBS 2022 code
stat_city_code | 7400                ← CBS semel_yishuv
```

**19 polygons with legacy 8-digit polygon_id** (e.g. `65966793`) cover 5,320 deals and FAILED coord backfill. Concentrated in באר שבע, אשדוד, רמת השרון, בת ים. These polygons don't match `gush-helka` format so `backfill-deal-coords.ts` couldn't autocomplete them.

### `mavat_plan_data` (scalars)

```
plan_number          | 101-0397752
mp_id                | 1000399927
plan_name            | פינוי בינוי- ברל לוקר 13
developer_name       | ההנדסה           ← 515/774 populated (confirmed only)
developer_confidence | confirmed         ← confirmed | NULL (after Issue 6 cleanup)
developer_source     | takanon_pdf_llm   ← takanon_pdf | takanon_pdf_llm | llm_reclassified
architect_name       | ניסים שיבלי
architect_company    | שיטת ההנדסה נצרת
submitter_company    | ההנדסה בע"מ
entity_type          | תכנית מתאר מקומית
status               | 0                  ← numeric status code
participant_count    | 63                 ← JSONB length
opposition_count     | 0
document_count       | 10
developer_email      | engmet2000@gmail.
developer_phone      | 04-6128500
fetched_at           | 2026-04-11
```

---

## Data coverage report (2026-04-19)

### Per-city PB plan → data availability

Running this matrix tells us where data gaps are:

```sql
WITH cm AS (
  SELECT u.yeshuv,
    EXISTS(SELECT 1 FROM parcels WHERE city_name = u.yeshuv) AS has_parcels,
    EXISTS(SELECT 1 FROM govmap_deals WHERE settlement = u.yeshuv) AS has_deals,
    EXISTS(SELECT 1 FROM statistical_areas WHERE city_name = u.yeshuv) AS has_sa
  FROM (SELECT DISTINCT yeshuv FROM urban_renewal WHERE yeshuv IS NOT NULL) u
)
SELECT COUNT(*) FILTER (WHERE has_parcels AND has_sa AND has_deals) AS all_three,
       COUNT(*) FILTER (WHERE has_parcels AND has_sa AND NOT has_deals) AS parcels_only,
       COUNT(*) FILTER (WHERE NOT has_parcels) AS no_parcels,
       COUNT(*) AS total
FROM cm;
```

Result 2026-04-19: **15 / 39 / 22 / 76**

- 15 cities exact-match everywhere (good)
- 39 cities have parcels + stat_areas but NO deal sync (Govmap sync coverage gap)
- 22 cities have CKAN-spelling that doesn't match parcels/stat_areas (spelling gap)

### CBS 2022/2011 mismatch per top-10 city

| City | semel | 2022 polygons | 2011 socio rows | Gap |
|---|---|---|---|---|
| ירושלים | 3000 | 243 | 184 | 59 |
| ראשון לציון | 8300 | 85 | 58 | 27 |
| בית שמש | 2610 | 47 | 20 | 27 |
| תל אביב-יפו | 5000 | 184 | 160 | 24 |
| אשקלון | 7100 | 53 | 30 | 23 |
| באר שבע | 9000 | 83 | 60 | 23 |
| אשדוד | 70 | 71 | 53 | 18 |
| חיפה | 4000 | 106 | 90 | 16 |
| פתח תקווה | 7900 | 81 | 65 | 16 |
| נתניה | 7400 | 73 | 58 | 15 |

Total 972 polygons nationwide with no socio cluster.

### Spelling-variant inventory (22 cities)

| CKAN spelling | Post-2017 Academy | Pattern |
|---|---|---|
| `תל אביב יפו` | `תל אביב-יפו` (and 3 more hyphen/space variants) | Hyphenation |
| `פתח תקוה` | `פתח תקווה` | Double-vav |
| `גבעתים` | `גבעתיים` | Double-yud |
| `הרצליה` | `הרצלייה` | Double-yud |
| `נהריה` | `נהרייה` | Double-yud |
| `קרית אונו` / `קרית אתא` / `קרית ביאליק` / `קרית גת` / `קרית טבעון` / `קרית ים` / `קרית מוצקין` / `קרית מלאכי` / `קרית עקרון` / `קרית שמונה` | `קריית X` (9 cities) | Double-yud in קרית |
| `בנימינה גבעת עדה` | `בנימינה-גבעת עדה` | Hyphen insertion |
| `פרדס חנה כרכור` | `פרדס חנה-כרכור` | Hyphen insertion |
| `צורן קדימה` | `קדימה-צורן` | Reversed order |
| `סחנין` | `סח'נין` | Gershayim insertion |
| `נוף הגליל` | (pre-2019: `נצרת עילית`) | City renamed |
| `אריאל` | `אריאל (ל.ש)` | Parcels suffix |
| `מעלה אדומים` | (missing from parcels) | West Bank coverage |

### Tables with 100% gush+helka coverage (for PostGIS cadastre joins)

- `parcels`: 1,094,533 rows, 100% gush+helka+centroid_lat+centroid_lng
- `govmap_deals`: 34,643 rows, 87% gush_num+parcel_num+lat+lng (from PR #6 backfill)
- `mavat_plan_data.blocks` JSONB: 774 plans, per-plan gush list
- `buildings`: 1,807 rows, 97% gush+helka (but concentrated Netanya only)

---

## Coordinate system reference

| System | Range | Used by | Conversion |
|---|---|---|---|
| **WGS84** (EPSG:4326) | lat 29-34, lng 34-36 | All `lat`/`lng` columns in our DB | — |
| **ITM** (EPSG:2039) | x ~180K, y ~690K | `lrt_stations.x/y`, `green_buildings.x/y`, `construction_progress.x/y` | proj4 2039↔4326 |
| **EPSG:3857 Mercator** | ~3.8M/3.8M | Govmap autocomplete `shape` field, Govmap `entitiesByPoint`, Govmap `real-estate/deals/{x,y}/{r}` | proj4 4326↔3857 |

Our DB standardizes to **WGS84 lat/lng** for all downstream use. ITM-native rows in `lrt_stations` have both sets of columns (backfilled).

---

## Name spelling fragmentation (example: Tel Aviv, semel=5000)

Same physical city, seven distinct spellings across our tables:

| Spelling | Tables | Rows |
|---|---|---|
| `תל אביב -יפו` (space before hyphen, no space after) | contractors, govmap_deals, parcels, public_housing_inventory, statistical_areas | 47,403 |
| `תל אביב - יפו` (spaces both sides) | active_construction, appraisers, brokers, green_buildings | 5,051 |
| `תל אביב-יפו` (no spaces) | govmap_deals, brokers | 954 |
| `תל אביב יפו` (no hyphen) | urban_renewal, brokers | 73 |
| `תל אביב` (no Yafo) | brokers | 327 |
| `תל-אביב` (hyphen, no Yafo) | brokers | 1 |
| `תל אביב -יפו` (mixed) | brokers | 1 |

Display: pick one canonical (Academy form: `תל אביב-יפו`). Join: use `5000` everywhere.

---

## Nadlan-bulk integration (2026-04-20 — current state)

The Tax Authority publishes pre-computed JSON per city/neighborhood at `data.nadlan.gov.il/api/...` — public, no auth. See `.claude/skills/government-data-sources/references/nadlan-bulk.md` for the full endpoint reference.

**Integration status: live-query only. No tables created.** The one endpoint we actually consume is wired through `mastra/tools/knowledge/city-info.ts` with a 24h in-memory TTL cache. Everything else was evaluated and skipped — either we already have the data, or the use case doesn't exist yet.

| Endpoint | Proposed table | Status | Rationale |
|---|---|---|---|
| `/api/additional_info/settlements/{semel}.json` | `nadlan_city_info` | **SKIPPED** — live-query via `getCityInfo()` instead | Data changes monthly, per-call cost is cheap, no cross-city queries needed today. If one lands, copy 4-6 scalars into `city_registry` directly. |
| `/api/pages/settlement/buy/{semel}.json` + rent variant | `nadlan_city_trends` | **SKIPPED** | 10yr quarterly medians are derivable from our own `govmap_deals` via `DATE_TRUNC('quarter', deal_date)` + room-count bucketing. No need to duplicate. |
| `/api/index/PolyNeighSett.json` | `nadlan_polygon_crosswalk` | **SKIPPED** | We don't filter by `neighborhood_id` anywhere in scoring; `govmap_deals.stat_city_code` (87% coverage) + `statistical_areas` ST_Contains cover the rare case. Revisit if neighborhood-level filtering becomes a scoring factor. |
| `/api/index/dealNatureIndex.json` (58 codes) | `nadlan_deal_nature` | **SKIPPED** | `govmap_deals.property_type` already stores normalized Hebrew (16 distinct values on 164K rows). Marginal value. |
| `/api/deals/...` per-deal records | — | **BLOCKED** (reCAPTCHA v3) | `govmap_deals` remains the per-deal source. |

**When to revisit**: if scoring ever needs cross-city queries over nadlan fields (e.g. "top 10 cities by luxury score"), the right move is 4-6 columns on `city_registry` populated via a small dedicated sync — not a new `nadlan_*` table.

## Key references

- DB introspection queries for this document: saved in companion file `.claude/plans/data-findings-research-2026-04-19.md`
- Schema definitions: `app/lib/schema.ts` (Drizzle)
- Sync scripts: `scripts/sync-*.ts`
- City config: `app/lib/cities.ts` (15 featured cities)
- City-matcher: `app/lib/city-match.ts`
- Full research: `.claude/plans/data-findings-research-2026-04-19.md`
- Fix plan: `.claude/plans/okay-let-s-create-a-jazzy-glacier.md`
- Nadlan bulk endpoints: `.claude/skills/government-data-sources/references/nadlan-bulk.md`
