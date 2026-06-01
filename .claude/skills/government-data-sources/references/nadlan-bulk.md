# `data.nadlan.gov.il` — Tax Authority bulk JSON CDN

**Discovered**: 2026-04-20
**Status**: Partial — `getCityInfo()` live-query wired (`mastra/tools/knowledge/city-info.ts`); four proposed tables evaluated + rejected (see bottom).

**See also**:
- [`fixtures/nadlan-bulk/`](../fixtures/nadlan-bulk/) — real sample payloads (config, dealNatureIndex full, settlement buy for Bat Yam, truncated additional_info for Jerusalem, 50-entry slice of PolyNeighSett) + `findings.md` with side-by-side comparisons against our `govmap_deals`
- [`docs/key-decisions/2026-04-20-nadlan-bulk-integration.md`](../../../../docs/key-decisions/2026-04-20-nadlan-bulk-integration.md) — ADR documenting alternatives considered + the "no `nadlan_*` tables" design rule

The Tax Authority's real-estate portal (`nadlan.gov.il`) is a React SPA. Its backend data is served as **pre-computed JSON files** on a CloudFront-fronted S3 bucket at `data.nadlan.gov.il`. Most endpoints are public (no auth), cache-friendly (GETs only), and UTF-8-BOM encoded.

This is a **complementary source**, not a replacement for Govmap: per-deal records on the `deals/` path are reCAPTCHA-gated, but the aggregate and reference data around them is freely available and much richer than what's on `data.gov.il`.

## Discovery

The config is itself a public file:

```
GET https://www.nadlan.gov.il/config.json
```

Returns base URLs and token endpoints. All the endpoint paths in this doc come from `config.json` + the SPA's JS bundle (`/assets/index.*.js`).

## Public endpoints (no auth, GET only)

### Per-city aggregate pages

| Endpoint | Keyed by | Size | Contents |
|---|---|---|---|
| `/api/pages/settlement/buy/{semel}.json` | CBS `semel_yishuv` | 50-200 KB | `settlementID`, `settlementName`, `x`, `y` (ITM), `otherNeighborhoods[]`, `otherSettlmentStreets[]`, `trends.rooms[]` (quarterly median price by room count, 10yr), `trends.indexes` (priceIncreases, yield, luxury), `version` |
| `/api/pages/settlement/rent/{semel}.json` | `semel_yishuv` | 150-200 KB | Same shape for rentals |
| `/api/pages/neighborhood/buy/{neighId}.json` | neighborhood_id | 15-30 KB | `neighborhoodId`, `neighborhoodName`, `settlementID`, `x`, `y` (ITM), `trends` (same shape) |
| `/api/pages/neighborhood/rent/{neighId}.json` | neighborhood_id | 15-30 KB | Same for rentals |
| `/api/compare/neighborhood/{neighId}.json` | neighborhood_id | — | Neighborhood comparison data |

**`trends.rooms[]` shape** (the main payload):

```json
[
  {
    "numRooms": 3,
    "hasDeals": true,
    "graphData": [
      {"year": 2025, "month": 3, "settlementPrice": 2211900, "countryPrice": 1580600},
      {"year": 2024, "month": 12, "settlementPrice": 2180900, "countryPrice": 1579900},
      ...10 years quarterly
    ],
    "summary": {...}
  },
  ...4 room-count groups: 1-2, 3, 4, 5+ rooms
]
```

**`trends.indexes` shape**:
```json
{ "priceIncreases": 0.54, "yield": 2.81, "luxury": 8 }
```

### Per-city rich metadata (the real gold)

```
GET /api/additional_info/settlements/{semel}.json
```

~3 MB per city. Jerusalem (3000) top-level keys:

| Key | Type | Contents |
|---|---|---|
| `HighBuilding` | dict | `Low`, `Medium`, `High` building counts |
| `RealEstateIndices` | dict of 12 | `LuxuryScore`, `SecondHand`, `FirstHand`, `SquareMeter`, `Property`, `RentAllRooms`, `AnnualReturn`, `AveragePriceIncrease`, `buy5Rooms`, `buy4Rooms`, etc. |
| `WalkingAvgDistance` | dict | `Parks`, `Schools` avg walking time |
| `GreenAreasSum` | float | Total green area (sqm) |
| `GreenAreasPercent` | float | Share of city that's green |
| `GreenAreaCount` | int | Count of distinct green areas |
| `Demography` | dict | `MedianSetlIncome`, `AvgChild`, `Sector`, `AcademicsInCity` |
| `Environment` | dict | `CellActives`, `CellActiveCount` (cell tower info) |
| `gardensAndParks` | list | Every park with `id`, `name`, `address`, `x`, `y`, `description` |
| `kidsGardensAndSchools` | dict | `municipalGardens`, `privateGardens`, `elementarySchools`, `juniorHigh`, `highSchools` |
| `community` | dict | `centers`, `clinics`, `religionPoints` |
| `arrangements` | dict | `stores`, `pharmacies` |

Example park record:
```json
{
  "id": "garden_93",
  "name": "גן - גן הלבנון",
  "address": "יערי אברהם 29",
  "x": 218561.4793, "y": 626861.6915,
  "description": "גן ציבורי שכונתי"
}
```

### Per-neighborhood rich metadata

```
GET /api/additional_info/neighborhoods/{neighId}.json
```

Same structural shape as the settlement version, scoped to one neighborhood.

### National index files

| Endpoint | Size | Contents |
|---|---|---|
| `/api/index/PolyNeighSett.json` | **7.2 MB** | **205,613 entries**: `{polygon_id: [neighborhood_id, inner_id, settlement_code]}`. Complete national crosswalk. |
| `/api/index/neigh.json` | — | Full neighborhood index |
| `/api/index/setl_types.json` | 187 KB | Settlement type taxonomy |
| `/api/index/dealNatureIndex.json` | 7.5 KB | **58 property type codes**: e.g. `{DealNature: 101, DealNatureDescription: "דירה בבית קומות", NewDealNatureDescription: "דירה"}`. Normalizes our `govmap_deals.property_type` strings. |

## Gated endpoint — per-deal records

```
GET /api/deals/settlement/{semel}_{page}.json     ← 403 AccessDenied
GET /api/deals/neighborhood/{neighId}_{page}.json ← 403 AccessDenied
GET /api/deals/street/{streetId}_{page}.json      ← 403 AccessDenied
GET /api/deals/asset/{assetId}_{page}.json        ← 403 AccessDenied
GET /api/deals/kparcel_all/{...}_{page}.json      ← 403 AccessDenied
```

Direct GET returns `<Error><Code>AccessDenied</Code></Error>`. The SPA accesses these via a reCAPTCHA v3 token from:

```
POST https://api.nadlan.gov.il/token-verify
Site key: 6LeFXPIrAAAAADG099BKMLMI85eElTM5qon0SdRH
```

**Same barrier as MAVAT SV4.** Automating requires Playwright + reCAPTCHA (see `sync-mavat.ts` for a reference pattern).

## Gotchas

1. **UTF-8 BOM on every response.** Python: decode with `utf-8-sig`, not `utf-8`. Node's `JSON.parse(buffer.toString())` needs `buffer.toString('utf8').replace(/^\uFEFF/, '')` first, or fetch with `.text()` and strip the BOM.
2. **Coordinates are ITM (EPSG:2039) in `x`/`y` fields, NOT WGS84.** Use `proj4` or our `itmToWgs84()` helper in `scoring-proximity.ts`. Convention matches LRT stations, NOT the rest of our DB (which is WGS84).
3. **`setlCode` = CBS `semel_yishuv`.** Joins cleanly to our `city_registry`, `urban_renewal.semel_yeshuv`, `statistical_areas.city_code`, `socioeconomic_index.city_code`.
4. **Cache-only distribution.** POST requests return `403 "This distribution is not configured to allow the HTTP request method that was used"`. It's a CloudFront origin; only GETs work, and bucket listings (`?list-type=2&prefix=...`) are blocked by an edge rule (returns a gov.il 404 HTML page).
5. **Dead URLs in old JS bundles.** `d1pbgh6hzbn1h3.cloudfront.net/backgroundMaps/03_01_2024/` was the previous origin, now DNS-dead. Always read live URLs from `https://www.nadlan.gov.il/config.json`.
6. **`version` field tells you the snapshot date.** E.g. `"version": "28-07-2025"`. Files are regenerated periodically — worth logging to detect stale data.
7. **Not all cities have data.** Small settlements may 404; always catch and skip.

## Integration status (as of 2026-04-20)

Replaces NOTHING we already have. Per-deal records remain Govmap's territory (the `/api/deals/...` path here is reCAPTCHA-gated — same barrier as MAVAT SV4).

| Endpoint | Decision | Rationale |
|---|---|---|
| `/api/additional_info/settlements/{semel}.json` | **Wired — live-query.** See `mastra/tools/knowledge/city-info.ts` (`getCityInfo`) + `tests/city-info.test.ts`. 24h in-memory TTL, graceful degradation to null on network fail. | File is 3 MB per city, regenerates monthly, and we only consume ~10 scalars. Storing it would waste ~450 MB for 50 bytes of useful data per city. Live-query + cache beats bulk sync. |
| `/api/pages/settlement/buy/{semel}.json` + rent variant | **Skipped.** | 10yr quarterly medians are derivable from our own `govmap_deals` via `DATE_TRUNC('quarter', deal_date)` + room-count bucketing. No need to duplicate. If it becomes a hot path, add a sibling live-query helper `getCityTrends()` next to `getCityInfo`. |
| `/api/index/PolyNeighSett.json` (205K polygon crosswalk) | **Skipped.** | `govmap_deals.stat_city_code` (87% coverage) + `statistical_areas` ST_Contains cover the neighborhood-resolution cases we have today. Revisit if neighborhood-level filtering becomes a scoring factor. |
| `/api/index/dealNatureIndex.json` (58 property types) | **Skipped.** | `govmap_deals.property_type` already stores normalized Hebrew (16 distinct values on 164K rows, mostly "דירה"). Marginal value. |
| `/api/deals/...` per-deal records | **BLOCKED** — reCAPTCHA v3 | Same barrier as MAVAT SV4. If we ever build a Playwright harness for MAVAT live queries, it extends naturally here. Govmap remains the per-deal source. |

**When to revisit**: if scoring ever needs cross-city queries over nadlan fields (e.g. "top 10 cities by luxury score"), the right move is 4-6 columns on `city_registry` populated via a small dedicated sync — NOT a new `nadlan_*` table. Keep the source-neutral naming: we're pulling facts into our domain, not mirroring someone else's schema.

## How to probe

Quick tests to verify an endpoint works for a given city:

```bash
# List the config (this is where all URLs come from)
curl -sS https://www.nadlan.gov.il/config.json | head -c 1000

# Jerusalem = 3000, Tel Aviv-Yafo = 5000, Netanya = 7400
SEMEL=3000
curl -sS "https://data.nadlan.gov.il/api/pages/settlement/buy/$SEMEL.json" \
  | python3 -c "import sys,json; print(list(json.loads(sys.stdin.buffer.read().decode('utf-8-sig')).keys()))"
```

Confirmed as of 2026-04-20, all major cities return HTTP 200 with valid JSON.
