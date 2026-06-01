# ArcGIS Online + iplan ArcGIS REST + Plan Annexes

All free, no-auth ArcGIS REST services. Two main hosts:
- `services2.arcgis.com/9xNzs4HrnCQY9yx4` — ArcGIS Online, 84 FeatureServices (Planning Admin public data)
- `ags.iplan.gov.il/arcgisiplan` — iplan on-prem, 45 MapServer services (same planning authority, different platform)

## 7. ArcGIS Online — Planning Administration Data (services2.arcgis.com)

Account: `services2.arcgis.com/9xNzs4HrnCQY9yx4` — **84 FeatureServer services** (verified 2026-04-10).
No auth required on any service.

### Currently Integrated Services

- `תחנות_מטרו/FeatureServer/4` — 109 Metro M1/M2/M3 stations (seeded → `metro_stations` table)
- `MipuiMN_FINAL/FeatureServer/0` — Plan Annexes (40K docs, queried live → `plan-annexes-queries.ts`)
- `SOEC_Stat11_2021/FeatureServer/27` — CBS socioeconomic clusters (synced → `socioeconomic_index` table). **Gap:** `index_value` always null — CBS field requires Hebrew `outFields`, only `cluster` + `population` fetched.

### HIGH-VALUE Unintegrated Services (discovered 2026-04-10)

#### 7a. שכבת_מתחמי_דיור — Housing Complexes (PB-CRITICAL)

```
GET https://services2.arcgis.com/9xNzs4HrnCQY9yx4/arcgis/rest/services/שכבת_מתחמי_דיור/FeatureServer/0/query
```

**9,876 records total, 3,747 are urban renewal (התחדשות עירונית).** 23 fields:

| Field | Type | Meaning | PB Value |
|-------|------|---------|----------|
| `POLYGON_NAME` | String | Complex ID (ת.ז של המתחם) | Identifier |
| `PLAN_NB` | String | Plan number | Links to XPLAN |
| `PLAN_NAME` | String | Plan name | Context |
| `POLYGON_TYPE` | String | Complex type | Classification |
| `PLAN_STATUS` | String | Status (e.g., "יוזמות וכוונות תכנון") | **Pipeline stage** |
| `FLAT_NUMBER` | Integer | Additional housing units | **Unit count** |
| `PLANING_TYPE` | String | **חדש / התחדשות** — distinguishes new from renewal | **PB filter** |
| `SUBMITTER_NAME` | String | **Submitter name** (ועדה מחוזית, or private) | **Developer lead** |
| `SETTLE_NAME` | String | Settlement name | City filter |
| `DISTRICT_NAME` | String | District | |
| `MP_ID` | Double | MAVAT plan identifier | Links to MAVAT |
| `YEARLY_WORK_PLAN` | String | Work plan year | Timeline |
| `PLANING_AREA` | String | Planning area | |

**Why this matters:** Only source that explicitly tags PB vs new construction, has submitter name, and links to MAVAT. Query: `PLANING_TYPE LIKE '%התחדשות%' AND SETTLE_NAME='בת ים'`

#### 7b. תקופת_בניה_1950_1980 — Building Construction Period

```
GET https://services2.arcgis.com/9xNzs4HrnCQY9yx4/arcgis/rest/services/תקופת_בניה_1950_1980/FeatureServer/0/query
```

**68,241 building polygons** with construction year. 6 fields: `BuildingID`, `MIN_B_year` (e.g., 1970), `FIRST_Fish`, `תקופת` (period: "1950-1959", "1960-1969", "1970-1979"). Has polygon geometry (WGS84).

**Why this matters:** Buildings from 1950-1980 are the primary PB candidates. Spatial query can identify which buildings at an address are old enough for demolition/reconstruction. Could power a "PB eligibility" check.

#### 7c. שכבת_מימושים — Plan Realization (Gaza Envelope only, NOT national) ❌

```
GET https://services2.arcgis.com/9xNzs4HrnCQY9yx4/arcgis/rest/services/שכבת_מימושים/FeatureServer/25/query
```

**Not nationally useful — verified 2026-04-20.** The full name from the service's own `serviceDescription` is **`שכבת מימושים בעוטף`** ("Realization Layer in the Envelope", i.e. עוטף עזה — the Gaza Envelope communities). All **18,053 lots are in Southern District only** (groupBy `Machoz` confirms), bbox ITM x=130K-176K / y=564K-617K covers Negev + Gaza border periphery. No Tel Aviv / Jerusalem / Haifa / coastal plain metro coverage.

26 fields including `TOCHNIT`, `MIGRASH`, `TARGUMYEUD`, `yDiur` (units), `MrMegurim` (residential sqm), `chadarim`, `mimush` (0/1 realization flag). **Residential distribution**: 5,493 lots with mimush=1 (11,060 units), 3,394 lots with mimush=0 (9,004 units) — 55% realization by units, region-wide.

**Why integration was abandoned (2026-04-20 probe):**
- **0 plan-number matches** to our `urban_renewal.mispar_tochnit` or `mavat_plan_data.plan_number` or `mavat_plan_data.related_plans[].PLAN_NUMBER` (tested all three). Uses a completely different plan-numbering system (ILA-internal for Gaza-envelope parcels).
- `MISHASAVA` ("conversion number") doesn't bridge to XPLAN `mp_id` either (tested).
- No sibling service exposes a crosswalk.
- Even if we forced a spatial-proximity join, our user base scores PB plans in metros the layer doesn't cover.

**Sibling services that are also not useful:**
- `מימוש_מגרשים_לתעסוקה` — employment/commercial lots, not residential
- `מתקנים_הנדסיים_מימושים` — engineering infrastructure only

**No national residential realization layer exists in the public ArcGIS catalogs** (exhaustive search of services2.arcgis.com/9xNzs4HrnCQY9yx4 and ags.iplan.gov.il/arcgisiplan as of 2026-04-20).

#### 7d. תמהילי_דיור_מנהל_התכנון — Housing Mix per Statistical Area (Layer 1)

```
GET https://services2.arcgis.com/9xNzs4HrnCQY9yx4/arcgis/rest/services/תמהילי_דיור_מנהל_התכנון/FeatureServer/1/query
```

**3,860 stat-area polygons, national coverage.** Spec: [`docs/specs/2026-04-20-housing-mix-phase-1.md`](../../../../docs/specs/2026-04-20-housing-mix-phase-1.md) • Fixtures: `fixtures/housing-mix/`.

**Schema vs reality (verified 2026-04-21):** the service advertises 124 fields, but **only 44 are ever populated**, and **only 2,527 of 3,860 rows (65.5%) have any meaningful data**. The other 1,333 rows are non-residential polygons (100% have `SHEM_YISHU = null` — industrial zones, agricultural land, forests, water). No hidden PB-relevant coverage gap.

**Always NULL** (despite being in the schema):
- All 18 age-bucket fields (`age_0_4` through `age_85_up`) — demographic breakdown advertised but never delivered
- `STAT11` — the obvious join key; use `YISHUV_STA` decomposition instead
- `Main_Fun_1`, `Male_Total`, `Female_Tot`, `SHEM_YIS_1`
- ~50 Field*/Hebrew-named variants

**Populated fields (44, at 65.5% row coverage):**
- **Identity**: `SEMEL_YISH`, `SHEM_YISHU`, `YISHUV_STA`, `Field2` (district), `Religion_1`
- **Population**: `Pop_Total` (2019 snapshot only — no sex/age split)
- **Apartment-size bins — 2020 snapshot (what we use):** `ש2020מ50עד80`, `ש2020מ80עד110`, `ש2020מ110עד150`, `מעל150שנת2020`
- **Apartment-size bins — 2011 snapshot (present but NOT USED by us — see decision below):** `ש2011מ50עד80`, `ש2011מ80עד110`, `ש2011מ110עד150`, `מעל150שנת2011`
- Settlement-level + district-level aggregations of the above

**Join key — canonical:**
```
YISHUV_STA = 62000213
semelYishuv  = YISHUV_STA / 10000 = 6200 (Bat Yam)
statArea2011 = YISHUV_STA % 10000 = 213
```
Joins cleanly to `socioeconomic_index(city_code, stat_area_code)` on CBS 2011 codes. Does NOT join directly to our `statistical_areas` table (CBS 2022 codes) without the known 2022↔2011 crosswalk gap.

**API characteristics (verified 2026-04-20):**
- Latency: median 800ms, range 713-1078ms
- Spatial query works in one call (`geometryType=esriGeometryPoint&inSR=4326`)
- Rate limit: 6,000 req/min (org-wide shared)
- `last-modified: 2025-03-25` — data refreshes rarely. Safe for 7-day client-side TTL.
- ETag supported for conditional GETs

### Decision 2026-04-21: we use 2020 fields only, NOT the 2011→2020 velocity derivation

During Phase 1 scoping we considered two groups of derivations:

1. **2020 snapshot** (kept): `aptSmallCount2020`, `aptSmallShare2020`, `aptLargeShare2020`
2. **2011→2020 velocity** (dropped): `aptSmallDeclineShare`, `aptLargeGrowthAbsolute`, `aptStockChange`

**Why we dropped the velocity derivations:**

- The measurement window starts in 2011 (**15 years ago** at decision time) and ends in 2020 (**6 years ago**). It tells us nothing about what's happened since 2020 — including the entire 2025 Tama-38 reform cycle.
- "Execution velocity" is what investors actually want to know for PB decisions today, and it's available from data sources that are fresh:
  - `govmap_deals.deal_date` — every transaction 2020-present; new-build vs resale density per stat_area
  - `construction_progress.stage_N_date` — current per-city stage completion rates
  - `active_construction` — currently-active construction sites near the address
- Pairing a 2020 snapshot with a 2011-starting velocity is methodologically confusing. The agent would cite "the area's stock-change velocity" without being able to say WHEN that velocity measured. Better to cite only what we know.

**What this costs us:** no long-term trajectory signal from this source. That's fine — Phase 2's scoring factor can derive momentum from our own current data when ready. This source's role in Phase 1 is **volume + character**, not velocity.

**What this gains:** a cleaner, shorter, less-caveat-heavy agent output. Three derivations instead of six. Honesty about measurement date.

### Sibling services evaluated and skipped (2026-04-20)

- `ישובים_תמהילי_דיור` and `מחוזות_תמהילי_דיור` — settlement-level and district-level rollups of the same data. Already present as secondary fields in this layer (`י2020*`, `מ2020*`). No new information.
- CBS `דירות וקבוצות גיל` CKAN dataset — would provide the age-demographics this layer is supposed to have. Out of scope for Phase 1; revisit only if age demographics become a scoring requirement.

#### 7e. מדרג_רגישות_משולב — Environmental Sensitivity Grading

9 fields: `יחידת_נוף` (landscape unit), `ערכיות_אקולוגית` (ecological value 1-5), `ערכיות_ניצפות` (visibility value), `רמת_רגישות` (sensitivity level 1-5). Polygon geometry.

**Why this matters:** High environmental sensitivity can delay or block PB projects requiring environmental impact reports.

### Other Notable Services (lower priority)

- `תחנות_רכבת_קלה/FeatureServer/0` — 344 LRT stations. **NOT worth switching to** — lacks `status` (operating/planned) and per-station `year_month` that our CKAN source has.
- `METRO_LINE/FeatureServer/0` — Metro line polylines
- `קווי_רכבת_קלה/FeatureServer/0` — LRT line polylines
- `תכנון_יוזמות_וכוונות_תכנון/FeatureServer/0` — Planning initiatives: 20 fields with future land use designations for 2040
- `FDOU_2040/FeatureServer/0` — Future urbanization projections with 2035 population estimates
- `תיקי_תיעוד2023/FeatureServer/0` — Conservation documentation files with links (14 fields)
- `shimour/FeatureServer` — Conservation (we use iplan.gov.il's Shimour MapServer instead)
- `ותמל/FeatureServer` — VATMAL (we use iplan.gov.il's vatmal MapServer instead)

**data.gov.il KMZ files for metro_stat are EMPTY** — `METRO_STAT.kmz` is 407 bytes, only XML header with zero Placemarks. Verified by manual download + extraction (2026-04-10). Always use the FeatureServer above.

---

## 8. iplan.gov.il ArcGIS REST Services (ags.iplan.gov.il)

Full catalog at: `https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic?f=json`

**45 MapServer services total** (verified 2026-04-10). All free, no auth, standard ArcGIS REST.

**Integrated services:**
- **Xplan** — Plan polygons, timeline, building program (see `references/xplan-vatmal.md`)
- **Shimour** — Conservation/heritage plans (3 layers: group, points Layer 1 with 16 fields, polygons Layer 2 with 17 fields). Integrated via `shimour-queries.ts` — queries both layers by spatial envelope, deduplicates by plan number.
- **vatmal_mitchamim_muchrazim** — Declared PB complexes (see `references/xplan-vatmal.md`)

**Unexplored services by priority:**

| Service | Layers | What It Has | PB Value |
|---------|--------|-------------|----------|
| **road_compilation** | 3 (interchanges, roads, detailed road plans) | Road planning compilation | Medium — road widening affects parcels |
| **train_compilation** | 1 (rail lines polyline) | Rail infrastructure plans | Medium — heavy rail proximity |
| **tma_70** | 7 (points, lines, polygons, land use, labels) | Metro master plan (תמ"א 70) | Low — we have metro stations directly |
| **compilation_tmm_tel_aviv** | ? | Tel Aviv district master plan | Low — district-level zoning |
| **tama35_hanchayot_svivatiot** | ? | TAMA 35 environmental guidelines | Low — environmental restrictions |
| **entities** / **entities_77_78** | ? | Plan entities (standard/77-78 regulations) | Low |
| **Xplan_6991** | 5 | Same as Xplan in EPSG:6991 | None — duplicate projection |
| **XplanNoKanam** | ? | Xplan without KANAM plans | Low |

6 district compilation services: `compilation_tmm_{darom,haifa,jerusalem,merkaz,tel_aviv,tzafonn}`

---

## 10. Plan Annexes FeatureService (discovered 2026-04-02)

**URL:** `https://services2.arcgis.com/9xNzs4HrnCQY9yx4/arcgis/rest/services/MipuiMN_FINAL/FeatureServer/0/query`
**Auth:** None — free, public ArcGIS FeatureService
**Records:** 40,419 plan document records
**Source:** ArcGIS Experience app "תכניות עם מסמכים ונספחים" (published Dec 2025 by Planning Administration)

### What It Has

Each record = one document attached to one plan. Fields:
- `PL_NUMBER`, `PL_NAME`, `MP_ID` — plan identifiers
- `DOC_GROUP_DESC` — document stage: נספח להוראות (draft), חתימת הפקדה (deposit), חתימת אישור (approval)
- `DOC_NAME` — document category (44 categories, see below)
- `ED_DOC_INFO` — specific document name (e.g., "נספח מים - מלל-חתום לאישור")
- `Main_Status`, `Secondary_Status` — plan status
- `PL_GOALS` — plan objectives
- `PL_URL` — link to MAVAT page
- Full timeline dates (same as XPLAN Layer 1 + extra: `Production_Of_The_Approval_Document_Date`, `PL_DATE_ISHUR_ITONIM`)

### Document Categories (44 types)

Key categories for PB investment analysis:
- **חוות דעת כלכלית** — economic opinion (viability analysis!)
- **תסקיר השפעה על הסביבה** — environmental impact report
- **נספח חברתי** — social appendix
- **סקר סיכונים** — risk survey
- **סקר גיאולוגי** — geological survey
- **סקר סייסמי** — seismic survey
- **סקר איכות קרקעות** — soil quality survey
- **תיעוד ושימור** — documentation and conservation
- **שמירה על עצים בוגרים** — mature tree survey
- **בינוי ופיתוח** — construction and development
- **תשתיות** — infrastructure (water, sewage, drainage)
- **הפקעות לצרכי ציבור** — public land expropriation

### Query Examples

```
# Documents for a specific plan
?where=PL_NUMBER='502-0196659'&outFields=*&returnGeometry=false&f=json

# All economic opinions
?where=DOC_NAME='חוות דעת כלכלית'&outFields=PL_NUMBER,PL_NAME,ED_DOC_INFO&returnGeometry=false&f=json

# Plans with environmental impact reports in a city (spatial query with city polygon)
```

### Investment Value

This is the **only free source** for knowing which specific professional documents a plan has submitted. An economic opinion (חוות דעת כלכלית) signals viability analysis has been done. An environmental impact report signals potential environmental constraints. A social appendix signals community impact assessment.

**Status:** INTEGRATED via `mastra/tools/plan-annexes-queries.ts` (April 2026). Used by the `propertyReport` tool — queries by plan number(s), groups documents by 44 categories, flags economic opinions/environmental reports/risk surveys.
