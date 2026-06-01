# Govmap REST API

**Base URL:** `https://www.govmap.gov.il/api`
**Auth:** None required
**Rate limit:** ~5 req/sec (enforced client-side at 200ms interval)
**Coordinates:** Mixed — **the `entitiesByPoint` endpoint uses EPSG:3857 Web Mercator, NOT ITM.** `autocomplete` returns ITM via WKT `shape`. See §1.4 for the corrected conversion. All real-estate-deals endpoints use ITM.

**Fixture bank:** `fixtures/govmap-entities/` + `fixtures/parcels-cadastre/` — every request + raw response from our 2026-04-18 probes (reference when extending integration).

## 1.1 Address Autocomplete

```
POST /search-service/autocomplete
Body: { "searchText": "רוטשילד 66 בת ים", "language": "he", "isAccurate": false, "maxResults": 10 }
```

**Response:** `{ resultsCount, results: [{ text, id, type, score, shape, data, originalText }] }`

- `shape` is WKT in ITM: `"POINT(3868718.278 3766807.824)"` — parse x,y from this
- Some results have NO shape (return null) — filter these out
- `type` can be: "street", "address", "city", "poi"

**Integrated in:** `app/lib/govmap-client.ts` → `autocompleteAddress()`

## 1.2 Deals by Radius

```
GET /real-estate/deals/{x},{y}/{radiusMeters}
```

**Response:** Raw array of polygons:
```json
[{ "dealscount": "20", "settlementNameHeb": "...", "streetNameHeb": null, "houseNum": null, "polygon_id": "7451-19", "objectid": 18272 }]
```

- `dealscount` is a STRING, parse to number
- `streetNameHeb` is null for ~77% of polygons (API limitation)
- `polygon_id` format: `"{gush}-{helka}"` or numeric ID
- Max useful radius: ~5000m

**Integrated in:** `govmap-client.ts` → `getDealsByRadius()`

## 1.3 Street/Neighborhood Deals

```
GET /real-estate/street-deals/{polygonId}?limit=500&dealType=2
GET /real-estate/neighborhood-deals/{polygonId}?limit=500&dealType=2
```

- `dealType`: 1=new construction, 2=resale
- `startDate`/`endDate`: YYYY-MM format (optional)
- `totalCount` is a STRING
- `dealDate` is ISO timestamp: `"2021-11-28T00:00:00.000Z"`
- `floorNo` is Hebrew text: "חמישית" (not a number)
- `shape` is MULTIPOLYGON WKT (strip before storage — huge)
- `assetArea` can be 1 for land deals (not actual area)

**Deal fields:** objectid, dealAmount, dealDate, propertyTypeDescription, assetRoomNum, assetArea, floorNo, settlementNameHeb, streetNameHeb, houseNum, neighborhood, polygonId, gushNum, parcelNum, subParcelNum, dealNatureDescription

**Integrated in:** `govmap-client.ts` → `getStreetDeals()`, `getNeighborhoodDeals()`

## 1.4 Entities by Point (Building-Level Property Data)

```
POST /layers-catalog/entitiesByPoint
Body: { "point": [mercX, mercY], "layers": [{"layerId":"6"},{"layerId":"11"},{"layerId":"14"},{"layerId":"16"},{"layerId":"22"},{"layerId":"23"}], "tolerance": 10 }
```

**CRITICAL — coord system:** `point` must be **EPSG:3857 Web Mercator**, NOT ITM. Verified 2026-04-18 (`fixtures/parcels-cadastre/govmap-api-entitiesByPoint-layers-15-6-13-21.json` shows ITM coords return empty; `govmap-api-entitiesByPoint-real-coord.json` + `govmap-api-layer15-sample-5.json` show Web Mercator working). Convert: `mercX = lng * 20037508.34 / 180`, `mercY = log(tan((90 + lat) * PI / 360)) / (PI / 180) * 20037508.34 / 180`. Or use proj4 EPSG:4326→3857.

**This is the most powerful single API call** — returns 6 layers of rich building data:

| Layer ID | Name | Key Fields |
|----------|------|-----------|
| **6** | parcel_ownership_new | גוש, חלקה, סוג בעלות (פרטית/רשות מקומית), שטח רשום |
| **11** | retzefmigrashim | יעוד (zoning), תוכנית (plan name), מגרש (lot number) |
| **14** | mehoziot_app_yk (MABAT) | **ALL planning entities** — can return 14+ plans! תכנית, שם תכנית, תיאור (status) |
| **16** | nadlan | objectId for deal polygon lookup |
| **22** | neighborhoods_area | שם שכונה/אזור |
| **23** | statistic_areas_2011 | "אוכלוסיה " (note trailing space!), תפקוד עיקרי |

**Response shape:**
```json
{ "data": [{ "name": "...", "layerId": "6", "entities": [{ "objectId": 123, "fields": [{ "fieldName": "גוש", "fieldValue": 7152 }] }] }] }
```

**Gotchas:**
- Field names are Hebrew with occasional trailing spaces ("אוכלוסיה ")
- Layer 14 returns MULTIPLE entities (one per planning entity) — iterate all
- Layer 6 may return 2 parcels (e.g., private + municipal adjacent)
- Not all layers return data for every point — handle missing gracefully

**Integrated in:** `govmap-client.ts` → `getEntitiesByPoint()`

## 1.5 Other Layers Discovered (NOT yet integrated)

| Layer ID | Name | What It Has |
|----------|------|-------------|
| 13 | stat_area_2022 | Updated 2022 statistical areas |
| **15** | **parcel_all** | **All parcels nationwide — `גוש`, `ת"ת גוש`, `חלקה`, `שטח רשום`, status, MULTIPOLYGON geom, centroid. VERIFIED working via `entitiesByPoint` with EPSG:3857 coords (2026-04-18). See `fixtures/parcels-cadastre/govmap-api-layer15-sample-5.json`.** |
| 21 | sub_gush_all | Gush blocks with settlement status |
| 24 | police_yehida_region | Police district info |
| 37 | building_layer_currency | Aerial photography date + quality |
| 46 | maagalbldg (nationwide buildings) | **Empty publicly** — `publicPublishType:0`, gated for emergency services |
| 65 | building polygon layer | Only aerial base-date — no building attributes |
| **211848** | **Be'er Sheva buildings** | שימוש, קומות, דירות, שם — **per-city floors+units** |
| **212061** | **Nes Tziona buildings** | num_floors, num_apts_c, num_entr, num_busns_, bldg_ch, bldg_num |
| **214047** | **Golan M.A. buildings** | same as Be'er Sheva |

**Key finding (2026-04-18):** NO Govmap layer exposes `year_built` anywhere nationwide. Floors/units exist ONLY in 3 per-city layers. For nationwide building-age data, must spatial-join the ArcGIS "Building Age 1950-1980" polygons against a parcel layer — see `fixtures/parcels-cadastre/findings.md` for the `helkot.zip` bulk-cadastre path.

## 1.6 Layers Catalog endpoint (full discovery, undocumented)

```
GET /api/layers-catalog/catalog
```

Returns the full **808-layer catalog** — services, layer IDs, captions, descriptions, extents, `publicPublishType`, `fieldsMapping`. No auth. Used to discover per-city building layers + other unintegrated services. Saved to `fixtures/govmap-entities/govmap-layers-catalog-full.json` (~1 MB).

## 1.7 Negative results (save future time)

- `entitiesByEnvelope` / `entitiesByPolygon` → return **"Cannot POST"**. The API is point-only, no bulk spatial query.
- `ags.govmap.gov.il/arcgis/rest/services` (the classic ArcGIS discovery URL) → **firewalled**. HTTP 200 with empty body; individual guessed service names 404/empty. Do not re-probe.
