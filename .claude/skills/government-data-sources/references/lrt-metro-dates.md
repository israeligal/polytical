# LRT/Metro Line Real Opening Dates (authoritative, 2026-04-17)

**Why this exists:** Our `lrt_stations.year_month` + `metro_stations.year_month` carry the ORIGINAL planned dates from NTA/CKAN datasets. Many are in the past (e.g. Green Line `yearMonth=202411`) because the original project schedule slipped. The scoring engine's `stationStatusMultiplier` previously auto-promoted any past-dated "planned" station to `multiplier=1.0` (operational) — wildly optimistic for delayed lines. Fixed 2026-04-17.

**The authoritative override table** lives at `mastra/tools/knowledge/transport/line-overrides.ts` with inline source URLs per line. Review annually.

## Tel Aviv LRT

| Line | Status | Realistic opening | Source |
|---|---|---|---|
| אדום (Red) | **operational** | Aug 17, 2023 | [NTA](https://www.nta.co.il/light-rail/red-line/) · [TheMarker Aug 2023](https://www.themarker.com/dynamo/cars/2023-08-18/ty-article-magazine/00000189-f36c-de6e-a1ff-fbfc91950000) |
| סגול (Purple) | planned | **July 2028** | [Ynet](https://www.ynet.co.il/news/article/rykwppw5yx) · [Mako](https://www.mako.co.il/news-money/2025_q4/Article-2c6401db6f8fa91027.htm) |
| ירוק (Green) | planned | **end-2028** (south), mid-2030 (full) | [Calcalist](https://www.calcalist.co.il/local_news/article/h1bjfwg5kg) · [Globes EN](https://en.globes.co.il/en/article-tel-aviv-light-rail-construction-plagued-by-delays-1001486278) |
| חום (Brown) | planned | 2032 (no firm date published) | Not in NTA's 2028/2030 public cohort |

## Jerusalem LRT

| Line | Status | Realistic opening | Source |
|---|---|---|---|
| אדום (Red) | **operational** | Aug 2011 | [Wikipedia](https://he.wikipedia.org/wiki/הרכבת_הקלה_בירושלים) |
| ירוק (Green) | planned | **May 2026** (south), 2027 (full) | [Calcalist](https://www.calcalist.co.il/local_news/article/hjk02dzsbe) · [TheMarker Oct 2025](https://www.themarker.com/dynamo/2025-10-22/ty-article/0000019a-0a96-dfc6-a3bf-fbb626750000) |
| כחול (Blue) | planned | **2031** | [Calcalist — 31 km, 2031](https://www.calcalist.co.il/local_news/article/hjk02dzsbe) |
| כחול בהיר, תכלת, חום, צהוב, ורוד | planned | 2032-2035 | No firm published date; conservative defaults |
| ירוק בהיר, חום דרומי | planned | 2035+ | Long-term plan; no firm date |

## Haifa LRT

| Line | Status | Realistic opening | Source |
|---|---|---|---|
| נופית (Nofit) | planned | 2033 (long-term network plan, no firm date) | — |
| כרמלית (Carmelit funicular subway) | **operational** | **Oct 6, 1959** | [Carmelit Haifa Ltd. operator nav](https://www.carmelithaifa.co.il/) |

**Carmelit notes:** 6 stations up Mt. Carmel, continuously operational since 1959 (never expanded), renamed 2018 (current Hebrew names match operator's Hebrew nav today; English nav still shows pre-2018 names — both sourced from the same site, both genuine). Seeded into `lrt_stations` via `pnpm seed:carmelit` outside the CKAN sync (Carmelit isn't in data.gov.il). Sentinel `ckan_id` block 99000001-99000006 distinguishes hand-seeded rows from real CKAN ids. Discriminator on `lrt_stations` is `(line, metro_area, type, company)`, not a `kind` column.

## Metro M1/M2/M3

| Line | Status | Realistic opening | Source |
|---|---|---|---|
| M1 / M2 / M3 | planned | **2040+** (was 2034) | [JPost — won't open before 2040](https://www.jpost.com/israel-news/article-855610) · [Ynet — state comptroller Dec 2025](https://www.ynetnews.com/business/article/bjeunwwvwg) |

## Usage notes

- **DO NOT trust** the `YEARMONTH` field in `services2.arcgis.com/.../קווי_רכבת_קלה/FeatureServer/0` — it's uniformly `201906` (data update date, not opening date).
- **DO NOT trust** `year_month` in `lrt_stations` / `metro_stations` for scoring — it reflects the original pre-delay plan. Use `resolveLineStatus` from `line-overrides.ts` instead.
- Fallback for unknown lines: `2037-01` (>10y out → multiplier 0.1 "long-term speculative"). Explicit signal that we have no data, not a silent promotion.
- Combined-line values (`אדום_חום` = station on both Red + Brown): resolver picks the most-operational component.

## Backstop source: תת"ל corridor plans (XPLAN, 2026-04-26)

The 164 substantive תת"ל plans on XPLAN Layer 1 carry a `station_desc` lifecycle (`אישור` / `תסקיר סביבתי` / `דיון בהתנגדויות ותיקונים` / etc.) — the planning-board pipeline status. `national_transport.status` (CKAN) carries a parallel cabinet pipeline (`מאושרת` / `מפורסמת לפי סעיף 78-77` / etc.). **Neither carries opening dates** — they track lifecycle stages, not forward forecasts.

Task #106 evaluated regrounding `line-overrides.ts` from these gov sources and **closed without code change** (2026-04-26): `expectedOpening` (the field that drives `stationStatusMultiplier`) cannot be regrounded — neither enum has an opening date. A status-only additive `regulatoryStatus?` field was specced and rejected as all-signal-zero-score. Annual human review on `line-overrides.ts` stays correct. Full reasoning + alternatives: [`docs/key-decisions/2026-04-26-line-overrides-gov-regrounding-rejected.md`](../../../../docs/key-decisions/2026-04-26-line-overrides-gov-regrounding-rejected.md). Operational fetch + filter + reputation-rule guidance for the underlying XPLAN data live in [`xplan-vatmal.md`](xplan-vatmal.md) §4c.
