# Municipal Planning Sources (Complot + Holon Minhelet + Protocol PDFs)

City-level planning data surfaces on a mix of platforms. Complot hosts 5 Israeli cities behind a shared SOAP backend. Holon runs its own Minhelet site. Bat Yam publishes committee-protocol PDFs directly.

## 12. Complot — Municipal Planning Committee Platform

**Front-ends** are thin WordPress+Elementor shells per city. The **real data is on a shared SOAP + Magic xPA backend at `handasi.complot.co.il`**, keyed by numeric `site_id` embedded in each front-end's JS globals.

### Backend overview

- **SOAP endpoint:** `POST https://handasi.complot.co.il/wsComplotPublicData/ComplotPublicData.asmx`
- **WSDL:** `https://handasi.complot.co.il/wsComplotPublicData/ComplotPublicData.asmx?WSDL` (~48KB, 27 operations)
- **Auth:** None. Plain `curl -A "Mozilla/5.0"` works.
- **SOAPAction header:** `"https://handasi.complot.co.il/<OpName>"` (HTTPS, no trailing slash, quotes required). Default `http://tempuri.org/` is REJECTED — verified gotcha.
- **Envelope namespace:** `xmlns="https://handasi.complot.co.il"` (not tempuri).
- **Magic xPA HTML endpoint** (`/magicscripts/mgrqispi.dll?...`): BLOCKED — returns 727B error page (`מצטערים, לא ניתן להציג...`). No session-state auth bypass found. Don't use.
- **Google Analytics ID:** `UA-3512425-43` — same shared account across all 5 Complot front-ends (confirms one-backend-many-sites architecture).

### Cities + site_ids (verified 2026-04-18)

| Front-end | site_id | CBS yeshuv code |
|---|---|---|
| `batyam.complot.co.il` | **81** | 6200 |
| `sderot.complot.co.il` | **38** | 1031 |
| `glt.complot.co.il` (Galil Tachton) | **10** | — |
| `mnf-temp.complot.co.il` (Ma'ale Naftali) | **2** | — |
| `galilmerkazi.complot.co.il` (Galil Merkazi) | **20** | — |

Discover `site_id` per domain via `var site_id = N;` in the homepage JS globals, or call `GetYeshuvim` / `GetUrlLink` once to confirm.

### Universal response envelope

Every operation returns `<OpResponse><OpResult><ReturnedItem><label/><v/><k/></ReturnedItem>...</OpResult></OpResponse>`.
- `label` — the human-readable value (plan number, name, street, etc.)
- `v` — optional secondary ID (numeric code, foreign-key)
- `k` — optional tertiary ID (typically the parent entity's code, e.g. yeshuv code)

### Template call

```bash
curl -sS -X POST \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H 'SOAPAction: "https://handasi.complot.co.il/<OPNAME>"' \
  -A "Mozilla/5.0" \
  --data '<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <OPNAME xmlns="https://handasi.complot.co.il">
      <site_id>81</site_id>
      <!-- params per WSDL -->
    </OPNAME>
  </soap:Body>
</soap:Envelope>' \
  "https://handasi.complot.co.il/wsComplotPublicData/ComplotPublicData.asmx"
```

### Complete 27-operation matrix (all probed 2026-04-18 against Bat Yam site_id=81)

| # | Operation | Input params | Records returned (site 81) | Sample label / v / k | Value | Priority |
|---|---|---|---|---|---|---|
| 1 | **GetYeshuvim** | `site_id:int` | 1 | `בת ים / 6200 / —` | Resolve site_id → city name + CBS yeshuv code | **High** |
| 2 | **GetStreets** | `site_id:int` | **272** (full enum, no cap!) | `אביהו לוי מדינה / 134 / 6200` | All city streets with municipal street IDs. Full enumeration — the only op without a 10-row cap | **High** |
| 3 | **GetShchunot** | `site_id:int` | 18 | `רמת יוסף / 15 / 6200` | All city neighborhoods | **High** |
| 4 | **GetTabaNumbers** | `site_id:int` | ~841 | `502-0126813`, `בי/1/566`, `ח/mk/3 -39-7` | All plan numbers the city's committee has records on | **High** (already used) |
| 5 | **GetTabaNames** | `site_id:int` | ~823 | `בי/1/566 - פינוי בינוי ברחוב הרצל-חנה סנש` | All plan titles (often embed street names + PB keywords) | **High** (already used) |
| 6 | **GetTabaTypes** | `site_id:int, policyDocuments:int` | 45 (pd=0), 0 (pd=1) | `תכנית מפורטת / 1` | Plan-type enumeration | Medium |
| 7 | **GetTabaStatusTypes** | `site_id:int` | 4 | `בתוקף/1`, `בהפקדה/2`, `בתכנון (הגשה)/9`, `הכל/0` | Plan-status enum — maps to MAVAT status codes | **High** |
| 8 | **GetTabaSamchuyotTypes** | `site_id:int` | 11 | `ממשלה/1`, `מועצה ארצית/2`, `ועדה מקומית/…` | Plan-authority (Samchut) enum | Medium |
| 9 | **GetTaba** | `site_id:int, prefix=planNum:string` | 1 (echo) for modern 502-XXXXXXX, **0 for legacy `בי/…`** | `502-0126813` | Validates plan existence. **Only resolves MAVAT-style 5xx-prefix numbers**; legacy city-code formats silently return empty | Medium |
| 10 | **GetGushim** | `site_id:int, prefix:long` | 10 (prefix-filtered autocomplete) | `2704`, `2709`, `2710` | Cadastre gushim enumeration. **Walk prefix space** (`"0"`, `"1"`, …, `"99"`) to bulk-enumerate past the 10-row cap | **High** |
| 11 | **GetHelkot** | `site_id:int, key=gush:int, prefix:long` | varies | gush 2704 prefix=1 → `1,10,11,12` | Helkot within a specific gush | Medium |
| 12 | GetMigrashimForGush | `site_id:int, key=gush:int, prefix:string` | **0** in tests | empty | Migrash subdivisions per gush — input contract unclear or site 81 has none | Needs research |
| 13 | GetMigrashimForTaba | `site_id:int, key:string, prefix=planNum:string` | **0** in tests | empty | Migrash list per plan — would unlock plan→parcels→addresses. Input contract unclear | Needs research |
| 14 | **GetMeetingTypes** | `site_id:int` | 5 | `רשות רישוי מקומית/1`, `ועדת משנה/2`, `ועדה מקומית (מליאה)/3`, `ועדת שימור/…` | **Meeting type codes — keys for `GetMeetingNumbers`** | **High** |
| 15 | **GetMeetingNumbers** | `site_id:int, key=meetingType:int, prefix:long` | 10+ per type (capped) | type 1: `1016, 2016, 3016…` / type 3: `20041602, 20041603, 20041604…` | Per-committee-type list of meeting numbers. **This is the local-committee meeting catalog** — different committee than MAVAT's district-level. Walk prefix space to bulk-enumerate | **High** |
| 16 | GetBakashotInMeeting | `site_id:int, key=meetingNum:int, prefix=meetingType:long` | **0** in all tried combos | empty | Intended to return permit-requests discussed in a specific meeting. **Input contract not yet cracked** — (meetingNum, meetingType) from GetMeetingNumbers returned empty. Try (key=compoundID, prefix=type) or swap semantics | Needs research |
| 17 | **GetBakashot** | `site_id:int, key=searchText:string, prefix=bakashaType:long` | 10 with `key=1, prefix=20` → `201208, 201209, 201210…` | `201208` | Permit-request numbers (autocomplete). `key` is free-text search filter; `prefix` is type code | Medium |
| 18 | GetBakashotTypes | `site_id:int` | 13 | `בקשה להיתר - רישוי מלא/1`, `בקשה למידע/5` | Permit-request type enum | Medium |
| 19 | **GetHeterNumbers** | `site_id:int, key=searchPrefix?:string, prefix=heterType:long` | 10 with `key=1, prefix=20` → `206, 2015, 2063, 205009, 2008002…` | `206` | **Issued building permits.** Evidence of recent heter activity on a parcel is a leading indicator that municipal plans are being acted on | **High** |
| 20 | GetBuildingNumbers | `site_id:int, prefix:long` | 10 (capped) | `105, 106, 107` | Building reference numbers (autocomplete only) | Low |
| 21 | **GetPikuachTypes** | `site_id:int` | **1** | `תיק מבנה מסוכן / 3` | **Dangerous-building file.** Only one inspection type exposed — specifically flags dangerous-building cases, which is a strong trigger for PB initiation | **High** |
| 22 | GetPikuachNumbers | `site_id:int, key=searchPrefix?:string, prefix=pikuachType:long` | **0** across all tried `(k,p)` combos incl. `(k='',p=3)` | empty | Inspection case numbers. Either site 81 has no declared dangerous buildings, or input contract is non-obvious | Needs research |
| 23 | GetPeopleTypes | `site_id:int` | 3 | `מבקש/1, בעל הנכס/2, עורך/3` | Role enum (applicant / property-owner / architect) | Low |
| 24 | GetPortfolioID | `site_id:int, key:string, prefix:long` | 10 with `k=1,p=1` → `103497312, 132022624, 182171799` (9-10 digit Israeli ID / corp numbers) | `103497312` | Applicant/owner ID lookup. **Could enable "which projects does this person/company have in this city"** | Medium |
| 25 | GetClients | `code:string` | 0 | empty | Requires undocumented opaque client code per municipality | Needs research |
| 26 | GetUrlLink | `site_id:int, page_index:int` | 1 per index | idx 0=`.../binyan/`, 1=`.../tikbinyan/`, 2=`.../iturbakashot/`, 3=`.../yeshivot/` | Resolves site's public portal URLs from just site_id | Medium |
| 27 | GetAnalyticsID | `site_id:int` | 1 | `UA-3512425-43` | Google Analytics tracking ID (shared across all 5 sites) | Not useful |

### Top 3 unexplored ops worth integrating next

1. **`GetMeetingNumbers` + `GetMeetingTypes`** — local-committee (ועדה מקומית) meeting catalog. This is a **different committee layer than MAVAT's district-level decisions** — lower-altitude, earlier-stage activity. Walk `meetingType ∈ GetMeetingTypes` and prefix space to bulk-enumerate.
2. **`GetHeterNumbers`** — issued building permits per city. Recent heter activity near a PB plan's parcels is leading-indicator evidence the plan is moving into execution.
3. **`GetPikuachTypes`** exposes only one type: **`תיק מבנה מסוכן` (Dangerous-Building File)**. A dangerous-building declaration is a strong trigger for Pinui Binui initiation. Needs a second probe to crack `GetPikuachNumbers`'s input contract before it's actionable.

### Unsolved input contracts (need another research pass)

- **`GetBakashotInMeeting(site_id, key, prefix)`** — empty for all `(meetingNum, meetingType)` combos from `GetMeetingNumbers`. Possibly `key` expects a compound meeting ID not exposed in the `label` field; try reading `v`/`k` of `GetMeetingNumbers` rows.
- **`GetMigrashimForGush(site_id, key=gush, prefix)`** + **`GetMigrashimForTaba(site_id, key, prefix=planNum)`** — both empty for valid-looking inputs. Either site 81 has zero registered migrashim or the `prefix` format differs.
- **`GetPikuachNumbers`** — empty across all `(k,p)` permutations even with the only valid pikuach type.
- **`GetClients(code)`** — opaque per-municipality client code, not discoverable from other ops.

### Gotchas

- **10-row autocomplete cap on most `prefix`-based ops** (not advertised in WSDL). Only `GetYeshuvim`, `GetStreets`, `GetShchunot`, `GetMeetingTypes`, `GetBakashotTypes`, `GetPikuachTypes`, `GetTabaTypes`, `GetTabaStatusTypes`, `GetTabaSamchuyotTypes`, `GetPeopleTypes`, `GetUrlLink`, `GetAnalyticsID` return the full enumeration. Everything else is autocomplete-only — to bulk-enumerate, walk prefix space.
- **`key` vs `prefix` conventions differ per op.** Sometimes `key` is a type discriminator (`GetMeetingNumbers.key` = meetingType), sometimes a parent entity ID (`GetHelkot.key` = gush), sometimes a free-text filter (`GetBakashot.key`). Read WSDL carefully per op.
- **WSDL declares `prefix` as `s:long`** but the service treats it as string-like (prefix `"27"` matches gush `2704` via numeric starts-with). The SOAP body must still pass a valid XML string though.
- **`GetTaba` only validates modern MAVAT numbers** (5xx-prefix). Legacy `בי/…` plan names return empty — breaks any plan-existence check that assumes both formats are indexed.
- **`policyDocuments=1`** on `GetTabaTypes` returns empty for Bat Yam — policy-document path is present in the API but unused in this municipality. May differ per city.

### Front-end pages per Complot site (pointers only)

- `/yeshivot/` — committee meeting list (JS-rendered from SOAP, no data in raw HTML)
- `/objectionsubmit/` — online objection submission form
- `/city_plan_tabageneral/` — general city plans
- `/city_plan_odot/` — planning information
- `/binyan/` — building information
- `/iturbakashot/` — permit-request search
- `/tikbinyan/` — building files
- `/dangerous_buildings/` — dangerous buildings search
- `/inclusiveplan/` — comprehensive urban renewal plan

All the above pages are SPA wrappers around the same SOAP backend. Skip HTML scraping and call SOAP directly.

### WordPress REST API (front-end shell only)

```
GET /wp-json/wp/v2/pages?per_page=50   — all pages
GET /wp-json/wp/v2/posts?per_page=50   — all posts
GET /wp-json/wp/v2/types               — custom post types
```

**Limitation:** Only stock WP types (`post`, `page`, `attachment`, `nav_menu_item`, `wp_block`, Elementor internals). No PB-specific custom post types on any of the 5 Complot sites. Meeting data, plans, permits, etc. are NOT in WordPress — they live on the SOAP backend above. Useful only to confirm a given site is truly a thin WP shell (it is) and to pull static navigation/content pages.

### Integration status

**Not yet wired into the codebase.** `GetTabaNumbers` and `GetTabaNames` were probed during Phase 2 planning (2026-04-17) but no scraper was built after research showed Complot plan numbers don't carry per-building addresses (verified `GetTabaFile` xPA endpoint is blocked; `GetTaba`/`GetMigrashimForTaba` don't fill the gap either) and MAVAT PublishingTextAPI doesn't resolve legacy `בי/…` formats (0/6 hit rate). Phase 2 pivoted to surfacing existing MAVAT committee data instead.

### Bat Yam re-probe 2026-04-18 (for coverage-gap decision)

Deeper re-probe confirmed the earlier assessment: most high-value ops return **empty on Bat Yam's instance**, even when WSDL-valid:

| Op | Bat Yam result | Implication |
|---|---|---|
| `GetBakashot(*)` | 0 across all 13 bakasha types + keys | Permit-request data NOT published |
| `GetBakashotInMeeting(*)` | 0 across all meeting-type combos | No permit-per-meeting link available |
| `GetHeterNumbers(*)` | 0 | No issued-permit enumeration |
| `GetPikuachNumbers(*)` | 0 | No dangerous-building list |
| `GetUrlLink(0..25)` | 0 for all | Portal URLs not configured on this site |
| `GetPortfolioID` (legacy `בי/`) | SQL error `Conversion failed when converting the nvarchar value 'בי/588' to data type int` | `key` param is int-typed despite WSDL saying `string` |
| `GetMigrashimForTaba(בי/529)` | 0 | Legacy plans have no migrash mapping here |
| `GetMigrashimForTaba(502-0730242)` | 0 | Even modern MAVAT IDs return no migrashim |

**Only usable tiers for Bat Yam:**
- `GetTabaNames` → **48 PB-related plan names** (of 781 total) filtered by keywords `פינוי/התחדשות/תמ"א 38` — many include addresses embedded in the label text (e.g. "רוטשילד 2", "כצנלסון 55-61", "בלפור 81", "קלויזנר 13", "קק"ל 9", "הרב מיימון 2-8")
- `GetStreets` → **272 streets** with IDs
- `GetShchunot` → 18 neighborhoods
- `GetTaba(prefix)` with decimal walk → **179 unique modern `502-NNNNNNN` plan codes** via prefix-tree enumeration (10-row cap per call)

**Cross-reference vs MAVAT:** MAVAT already covers ~30 Bat Yam plans with 250 per-building addresses. Complot exposes ~48 PB plan names — **~18 legacy `בי/…` plans not surfaced by MAVAT**, each with descriptive text.

### Stubs to create before integrating

When implementing Complot for Bat Yam:
1. **`scripts/municipal-scrapers/complot-client.ts`** — generic SOAP client (reuse for all 5 Complot cities). Takes `{siteId, op, params}`, handles the SOAPAction namespace + envelope, parses `<ReturnedItem>` into `{label, v, k}`.
2. **`scripts/municipal-scrapers/complot-batyam.ts`** — Bat Yam-specific scraper: calls `GetTabaNames(81)` → filters PB keywords → LLM-extracts `{planCode, projectName, addresses[]}` from the descriptive label via Gemini Flash.
3. **Unit test fixtures** — capture real XML from `/tmp/complot-probe/xml/` (or regenerate via the probe script) and seed into `tests/fixtures/complot-batyam-*.xml`. Needed for deterministic test runs since SOAP responses are non-trivial to fabricate.
4. **`queryMunicipalByAddress` already handles both sources** — Complot projects go into `municipal_projects` with `source_platform='complot-soap'`, no new repo function needed.

### Schema considerations

- `municipal_projects.source_platform` already accepts free-form text → just add `'complot-soap'` alongside existing `'holon-minhelet-rss'`.
- Complot doesn't give us protocols/letters like Holon does → Phase 1.5 doc-mining columns (`design_team`, `project_coordinators`, `compensation_terms`, `unit_program_history`, `municipal_events`, `source_documents`) stay NULL for Complot-sourced rows. That's fine — `updateMunicipalProjectDocuments` is a partial update.
- Plan code variations (`בי/ 809` vs `בי/809` — spacing, slashes) need canonicalization before `plan_numbers` JSONB storage. Add a normalize step in the scraper.

**When to revisit Complot integration:**
- If scoring needs local-committee (ועדה מקומית) activity for Complot cities → integrate `GetMeetingTypes` + `GetMeetingNumbers`, then crack `GetBakashotInMeeting` to get items-per-meeting.
- If scoring needs recent permit activity as PB leading-indicator → integrate `GetHeterNumbers`.
- If scoring needs dangerous-building flags → crack `GetPikuachNumbers` input contract first.
- If we ever need to map Complot-city plans to buildings deterministically → crack `GetMigrashimForTaba` (plan→parcels → Govmap addresses), OR fall back to XPLAN polygon + Govmap `entitiesByPoint` spatial query.

### Fixtures

Raw XML responses for all 27 operations (site 81) captured during 2026-04-18 probe at `/tmp/complot-probe/xml/` (35 files). WSDL at `/tmp/complot-probe/wsdl.xml`. Reusable probe script at `/tmp/complot-probe/call.sh` — takes `<OpName> <innerXmlBody> [suffix]`. Copy into `tests/fixtures/complot-*.xml` if implementing.

---

## 12b. Holon Minhelet (minhelet-holon.co.il) — INTEGRATED (Phase 1, 2026-04-16)

**URL pattern:** `https://www.minhelet-holon.co.il/projects/`
**Data source:** WordPress-generated RSS feed at `/projects/feed/` — each `<item>`'s `<content:encoded>` contains the full detail-page HTML inline.
**Auth:** None; `robots.txt` fully open.

### Coverage

9 projects covering Holon urban-renewal plans (Yoseftal, Jessie Cohen, Tel Giborim, Kogel, Dov Hoz/HaMa'apilim, Hatzav, Golda-Hofein, Mivtza Sinai, ח/619 framework). Pulls project name, canonical URL, full Hebrew description, plan numbers (MAVAT 505-NNNNNNN + legacy ח/XXX), and pre-expanded per-building addresses.

### Integration

- Scraper: `scripts/municipal-scrapers/holon.ts` — one RSS fetch; cheerio XML mode parses `<item>` entries; embedded detail HTML parsed for plan numbers + addresses.
- Address expansion: `scripts/municipal-scrapers/shared.ts#expandAddressRange` — turns "הסתדרות 197-209, רוטשילד 3, 5, 7" into flat `[{STREET_NAME, HOUSE_NUMBER, CITY_COUNTY}]` rows so the MAVAT-style JSONB containment query works. Filters narrative words (תכנית, מתחם, …) and unreasonable ranges.
- Storage: `municipal_projects` table, unique on `(source_city, source_slug)`, GIN-indexed on `addresses` + `plan_numbers`.
- Repository: `repositories/municipal-projects.ts` — `upsertMunicipalProject`, `queryMunicipalByAddress` (exact → street-only fallback), `queryMunicipalByCity`.
- Sync: `pnpm sync:municipal` (CLI) + weekly cron `/api/cron/sync-municipal` Mon 09:00 UTC.
- Agent wiring: `searchByAddress` surfaces matches as `municipalProjects` field; `scoreProject`'s `gatherDeepData` runs `queryMunicipalByAddress` in parallel alongside `queryUrbanRenewalByAddress`; `extractDeepInputs` treats either CKAN or municipal hits as `hasAddressMatch=true` (CKAN wins when present, municipal fills the gap).

### Known coverage gaps

Ein Yahav 9 / Kraso-Levinsky is NOT in the Holon feed — that specific plan is approved by the local committee but published elsewhere (news articles, not the Minhelet site). Unblocking that address requires a news-search fallback, not additional scraping here.

---

## 13. Municipal Protocol Pages

### Bat Yam Municipal Protocols

**URL:** `https://www.bat-yam.muni.il/protocols/`
**Format:** Publicly listed protocol PDFs
**Category filter:** `?category=5` for planning committee protocols

Contains meeting minutes (פרוטוקולים) for all municipal committees including planning and building. These are downloadable PDFs with committee decisions on plans, objections, permits.

**Status:** NOT integrated. Could scrape the protocol list page and link PDFs to plans by plan number.

---

## 14. Netanya Urban Renewal Mitham Cards — INTEGRATED (Phase 2, 2026-04-18)

**URL pattern:** `https://www.netanya.muni.il/CityHall/Engineering/UrbanRenewal/Pages/%D7%9B%D7%A8%D7%98%D7%99%D7%A1%D7%99 %D7%9E%D7%AA%D7%97%D7%9D/mitham{N}.aspx`
(The path segment "כרטיסי מתחם" requires URI-encoding. Some special mithams — 29, 75, 108, 109 — live at alternate Documents/ paths and are not currently scraped.)

**Index page:** `https://www.netanya.muni.il/CityHall/Engineering/UrbanRenewal/Pages/KartisiMitcham.aspx` — lists all mitham IDs. As of 2026-04-18 there are 87 mithams in the index.

**Table structure** (verified against mitham1, mitham20):
- Table 0 = contact info (skip)
- Table 1 = **8-column plot registry** (when present): גוש, חלקה, כתובת, מספר יחידות דיור, מספר קומות, שנה, שטח חלקה במ"ר, הערות
- Tables 2-4 = 3-column rollovers (גוש, חלקה, כתובת only — no year/units/floors)

**Real-world messiness handled by the parser:**
- Zero-width spaces (`\u200b`) in headers and cells — stripped
- `&quot;` HTML entities inside headers — decoded
- `helka = "-"` sub-parcel rows — null helka but retain address/units/year
- `lot_sqm = "1035*"` approximate marker — strip `*`
- `lot_sqm = "-"` unknown — null
- Hebrew-letter house-number suffixes like `"הרב קוק 1א'"` — captured as houseNumber=`"1א'"`
- Header variants: `"מספר יחידות דיור"` vs `"יחידות דיור"`, `"מספר קומות"` vs `"קומות"`

**Parser:** `scripts/municipal-scrapers/netanya-mitham-parser.ts` — pure functions, 33 unit tests covering parseAddress, parseIntOrNull, parseFloatOrNull, header classifiers, real-HTML fixture integration.

**Scraper orchestrator:** `scripts/municipal-scrapers/netanya-mitham.ts` — fetches index + per-mitham cards, filters 404 placeholder pages, flattens `MithamCard → NetanyaBuildingRow[]`.

**Sync CLI:** `scripts/sync-netanya-mitham.ts` — run `pnpm tsx --env-file=.env.local scripts/sync-netanya-mitham.ts [--dry-run] [--mitham N] [--limit N]`.

**Storage:** Writes to the shared `buildings` table (not `municipal_projects`) with `source='netanya_mitham_card'`. Per-field provenance via `sources[]` JSONB; latest-non-null-wins merge in `upsertBuilding`. Keyed by (gush, helka) cadastre first, falls back to (city='נתניה', street, house_number) for sub-parcel rows where helka is `-`.

**8-col coverage is spotty:** only a subset of mithams have the full registry with year/units/floors (mitham 1 and 20 in our sample). Many mithams carry only 3-col rollover tables. The plots still flow into `buildings` as identity-only rows (no year), providing (gush, helka) coverage for address resolution.

**Fixtures:** `tests/fixtures/netanya-mitham/mitham1.html`, `mitham20.html`, `index.html`.

**Agent wiring (Phase 3):** `scoreProject` auto-folds `buildingFacts` (yearBuilt, units, floors, lotSqm, sources) when the resolved address matches a `buildings` row. Agent instructions cite sources and surface tama38 eligibility when yearBuilt < 1980.
