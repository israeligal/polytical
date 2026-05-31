# MAVAT / iplan.gov.il (Planning Authority)

Covers all MAVAT APIs: SV4 (reCAPTCHA-protected), PublishingTextAPI (no auth), and the developer-identification audit that spans multiple data sources.

## 2. MAVAT SV4 REST API

**Status:** API fully reverse-engineered (April 2026). Not integrated for live queries — requires browser context for reCAPTCHA token. Bulk-extracted plan data lives in `mavat_plan_data` table.

### 2.1 How MAVAT Works (reverse-engineered)

MAVAT is an Angular SPA behind a WAF. All REST endpoints are blocked for direct HTTP requests (curl returns error pages). The SPA uses **reCAPTCHA v3 (invisible)** to generate auth tokens.

**Access method (proven via Playwright):**
1. Navigate to any MAVAT page in a browser (e.g., `https://mavat.iplan.gov.il/SV4/1/{mp_id}/310`)
2. Generate token: `grecaptcha.execute('6LeUKkMoAAAAAH4UacB4zewg4ult8Rcriv-ce0Db', {action: 'SV4'})`
3. Call the REST API with the token in the `authorization` header
4. Token is ~2,233 chars, expires in ~2 minutes

**reCAPTCHA site key:** `6LeUKkMoAAAAAH4UacB4zewg4ult8Rcriv-ce0Db` (v3, not enterprise)

**Scraper rate-limit reality (verified 2026-04-16):**
- Practical token budget is **~15 plans per reCAPTCHA token**, not 50. The existing `scripts/sync-mavat.ts` uses a 50-call refresh interval, which works only because of the 1.5s inter-call delay; at faster rates we observed `grecaptcha is not defined` / `Cannot read properties of undefined (reading 'execute')` errors starting around call 20.
- On token failure, refresh via a hard `page.goto()` + `await page.waitForFunction("typeof grecaptcha !== 'undefined' && grecaptcha.execute")` — a plain `page.reload()` with `waitUntil: "networkidle"` often times out at 30s on MAVAT.
- **F5 BIG-IP TLS token:** MAVAT's WAF issues a session token (`TSe3b956a2027=...` cookie) that is valid for the first XHR request on page load. Subsequent same-page XHRs to `/rest/api/SV4/1` return HTTP 200 with **empty body**. Direct `fetch()` from page JS after Angular has loaded produces empty responses too. To get a 2nd response you must either (a) reload the page, or (b) SPA-navigate via `history.pushState` + `popstate` to a different plan, which triggers Angular's router to re-fetch.

### 2.2 SV4 Plan Detail API (the main endpoint)

```
GET https://mavat.iplan.gov.il/rest/api/SV4/1?mid={mp_id}&guid=0
Headers: { authorization: "{recaptcha_token}" }
```

**Returns ~104KB JSON per plan** (can be as small as ~33KB for simpler plans — verified on Bnei Brak plan 501-1146117 mp_id=5005260664, 2026-04-16). Full response structure (verified for plan 502-0196659, mp_id=5000299051):

| Key | Type | Count | What It Contains |
|-----|------|-------|-----------------|
| `planDetails` | object | **22 keys — enumerated below** | ID, number, name, structural classification fields |
| `rsLocation` | array | 13 | All affected addresses: district, city, street code, house number |
| `rsBlocks` | array | 1 | Gush/helka with full and partial parcel lists |
| `rsInternet` | array | 17 | **Full processing timeline** — 17 stages with dates and descriptions |
| `rsOppositions` | array | 4 | **Objections**: opponent first/last name, type, company, serving period, PDF attachment ID |
| `rsDesInvited` | array | 139 | **Meeting participants** with full names (developers, architects, lawyers attend) |
| `rsDes` | array | 3 | **Committee decisions**: committee name, meeting date, decision text, attachment IDs |
| `rsPlanDocs` | array | 31 | **Plan documents**: name, attachment ID, file type, category ("מסמכים חתומים") |
| `rsPlanDocsAdd` | array | 11 | Additional administrative documents |
| `rsPlanDocsGen` | array | 43 | General documents with 4-level categorization |
| `rsQuantities` | array | 8 | Detailed quantities: housing units, sqm, hotel rooms, commercial, employment, public |
| `rsRelation` | array | 15 | Related plans with relationship types and comments |
| `rsOpenOpp` | object | 4 | Open objection period: `CAN_SUBMIT_OPPN`, `OPPN_END_DATE` |
| `recExplanation` | object | 5 | Plan explanation text with document attachment |
| `rsTasrit` | array | 1 | Plan drawing (תשריט) attachment |
| `rsInstructions` | array | 1 | Plan instructions (הוראות) attachment |
| `printCounters` | array | 11 | Document version tracking |

**`planDetails` sub-object — all 22 keys** (verified 2026-04-16 on plans 501-1146117 and 5000276359):

| Field | Type | Meaning | Notes |
|-------|------|---------|-------|
| `ID` | number | Record ID (internal) | |
| `DESCRIPTOR` | string | Plan descriptor | |
| `NUMB` | string | Plan number (e.g., `501-1146117`) | same as `number` in PublishingTextAPI |
| `E_NAME` | string | Plan name | |
| `MASTER_ID` | string | MAVAT master ID (`mp_id`) | same as `masterId` in PublishingTextAPI |
| `ENTITY_TYPE_ID` | number | Entity type numeric code | `1` for regular plans |
| `ENTITY_SUBTYPE` | string | Entity subtype Hebrew label | e.g. "תכנית מתאר מקומית", "תכנית מפורטת" |
| `ENTITY_SUBTYPE_ID` | number | **Entity subtype enum** | **`30` = תכנית מתאר מקומית, `40` = תכנית מפורטת** |
| `ENTITY_PHASE_CODE` | number | Lifecycle phase code | |
| `PHASE` | string | Lifecycle phase Hebrew label | e.g. "הגשה", "אישור" |
| `AUTH` | string | Authority | "מקומית" / "מחוזית" |
| `PERMISSIONS` | string | Permit-issuance classification | `תכנית שמכוחה ניתן להוציא היתרים או הרשאות` (most) / `תכנית שמכוחה לא ניתן להוציא היתרים או הרשאות` (rare) |
| `DETAILED` | number | Boolean-as-int | `1` = contains detailed-plan provisions |
| `DETAILED_DESC` | string | Hebrew label for DETAILED | "כן" / "לא" |
| `THREE_D` | number | 3D plan flag | |
| `UNITY` | string | Union/division type | e.g. "איחוד ו/או חלוקה ללא הסכמת כל הבעלים" / "ללא איחוד וחלוקה" |
| `ARTICLE` | string | **Planning Law section the plan invokes** | values like `62א (א) (21)`, `62א (א2) (1)`, `62א (ג)` |
| `EDITION` | number | Edition number | |
| `EDITION_DATE` | epoch ms | Edition date | |
| `LAST_UPDATE_DATE` | epoch ms | Last update | |
| `GOALS` | string | Plan objectives free text | richer than XPLAN's `pl_objectives` |
| `INSTRACTIONS` | string | Main instructions free text | note the typo — it IS spelled `INSTRACTIONS` in the response |

**`ENTITY_SUBTYPE_ID` is the only MAVAT plan-type enum.** Two values populate ~97% of plans: `30` (local master plan) and `40` (detailed plan). Not discriminating by urban-renewal track — appears identically on Shaked, TAMA 38, and Pinui Binui. The `ARTICLE` string is more granular.

**Objection record example:**
```json
{ "OPP_NUM": 2, "OPPONENT_TYPE": "מתנגד הרואה עצמו נפגע",
  "OPPONENT_FIRST_NAME": "עו\"ד איתי משה", "OPPONENT_LAST_NAME": "בשם מצלאוי חברה לבנין בע\"מ",
  "SERVING_PERIOD": "הפקדה להתנגדויות",
  "ENTITY_DOC_ID": 5000537666881, "ATTACHMENT_ID": 5000013608303, "FILE_TYPE": "pdf" }
```

### 2.3 Search API

```
POST https://mavat.iplan.gov.il/rest/api/sv3/Search
Body: { "text": "רוטשילד בת ים", "fromResult": 1, "toResult": 20, "_page": 1, "token": "..." }
```

Same reCAPTCHA token requirement. Returns plan search results.

### 2.4 ZIP Document Download

```
POST https://mavat.iplan.gov.il/rest/api/zipAttacments
Body: { "auth": "", "fname": "התנגדויות_502-0196659.zip",
        "ids": [5000527593125, 5000537666881, ...],
        "entityNumber": "502-0196659", "token": "..." }
```

Downloads a ZIP of all attachment PDFs for a plan section (e.g., all objection documents).

### 2.5 Other MAVAT Endpoints Discovered

- `GET /rest/api/GetAppealUrl/` — returns appeal/objection submission URL (no auth needed)
- `GET /rest/api/getAboutHtml/` — returns about page HTML (no auth needed)

### 2.6 How to Get mp_id (no MAVAT needed)

`mp_id` is the key to MAVAT. Available from two free sources:
1. **XPLAN `pl_url` field** — URL contains mp_id: `https://mavat.iplan.gov.il/SV4/1/{mp_id}/310`
2. **Govmap Layer 14** — `planId` field (parsed at `govmap-client.ts:426`)

### 2.6b תת"ל transit-corridor plans — variant of the same SV4 pipeline (April 2026 probe)

The SV4 pattern documented above works **unchanged** for תת"ל / National Infrastructure Plans (`pl_number LIKE 'תתל/%'`). Same URL shape, same reCAPTCHA flow, same `extractMpIdFromUrl` regex. **However**, XPLAN is the recommended primary fetch path because it returns polygon geometry in WGS84 directly — see [`xplan-vatmal.md`](xplan-vatmal.md) §4c for the canonical curl + ingest strategy.

**Key differences from urban-renewal plans:**

| Aspect | Urban-renewal | תת"ל |
|---|---|---|
| `mp_id` format | 7 digits, `5000XXXXXX` block | 11 digits, `99005XXXXXX` block |
| `pl_number` format | `502-XXXXXXX` / `בי/...` legacy | `תתל/ X` (with literal trailing space; `תתל`, NOT `תת"ל`) |
| Total in XPLAN | ~thousands | **306 rows** (164 substantive + 142 publication-notice/facility-drawing variants) |
| Geometry in XPLAN | polygon (yes) | **polygon (yes — confirmed via `outSR=4326`)** |
| `entity_subtype_desc` | `תכנית מתאר מקומית` / `תכנית מפורטת` | `תכנית לתשתית לאומית` (164) / publication-notice variants (138) / `תשריט מתקן` (4) |
| `station_desc` enum | `התכנית אושרה` / `בתוקף` etc. | **separate enum**: `אישור` (123) / `תסקיר סביבתי` (26) / `דיון בהתנגדויות ותיקונים` (6) / etc. |
| `rsDesInvited` participants | private developers, architects, lawyers | gov agencies (NTA, רכבת ישראל), environmental consultants — **NOT to be classified as developers** |

**Filter to the substantive 164 only.** When ingesting, use `WHERE entity_subtype_desc = 'תכנית לתשתית לאומית'` — the 142 procedural rows share `mp_id` families with the substantive plans and would create duplicate inserts. Verified counts in [`fixtures/mavat-tatal/findings.md`](../fixtures/mavat-tatal/findings.md) §2.

**Spatial attribution (Strategy A):** because XPLAN already returns the תת"ל polygon in WGS84, the natural pattern for "is this building inside the corridor footprint?" is `ST_Contains(boundary_geom_4326, ST_Point(lng, lat))` against the XPLAN polygon — no curated seed table required for the join. A curated `mp_id → "אדום"/"ירוק"/"M1"` lookup is still useful for **display labels**, since `pl_name` for some corridor plans is geographic-only (`תתל/ 74` is `שדה לתעופה כללית, חדרה`, not LRT-line-encoded).

**CKAN-side join keys are unreliable for תת"ל**:
- `national_transport.plan_link` carrying a parseable `/SV4/1/{mp_id}/` URL: only **31 of 152** active rows. Treat as confidence-boost when present, never as a primary join.
- `plan_county_name` populated: ~76 of 200 sampled rows — corridors cross many cities, so XPLAN frequently leaves county null. Use geometry, not text scoping.

**Per-row enum mapping must NOT reuse the urban-renewal `currentStage` map.** The 7-value `station_desc` vocabulary above is its own — overlaying the urban-renewal mapping silently relabels תסקיר סביבתי as something it isn't.

**Do NOT run `extract-developers.ts` on `plan_kind = 'tatal_transit'`** — it will produce gov-agency names that fail the reputation rule. Gate the script with `WHERE plan_kind = 'urban_renewal'` at the top of its main loop.

**Status:** **Shipped 2026-04-26.** All 164 substantive תת"ל plans ingested via `pnpm sync:mavat:tatal` into `mavat_plan_data` with `plan_kind='tatal_transit'` + WGS84 `boundary_geom_4326` (GIST-indexed, geometry-validated against hole-outside-shell self-intersections). Read path: `findTatalCorridorsForPoint({lat, lng, statAreaCode})` returns `matchType: "polygon_containment" | "stat_area_intersection"` per row; auto-folds into `scoreProject.nearbyTransitCorridors[]` as a *neighborhood* fact (NOT folded into building-level `planningStage`). Repository reads default-filter to `plan_kind='urban_renewal'` so urban-renewal callers are byte-identical; corridor lookups must opt in. SV4 enrichment optional via `sync-mavat.ts --kind tatal_transit` (NOT yet wired into the canonical pipeline). Full Phase-0 probe results, attribute samples, and joins to `national_transport` / `lrt_stations` / `metro_stations` are in [`fixtures/mavat-tatal/findings.md`](../fixtures/mavat-tatal/findings.md). Operational fetch reference at [`xplan-vatmal.md`](xplan-vatmal.md) §4c.

### 2.7 What's ONLY in MAVAT (not available from XPLAN, CKAN, or data.gov.il)

| Data | Why It Matters | Alternative |
|------|---------------|-------------|
| Objection details (names, types, PDFs) | Risk signal — legal challenges delay 2-5 years | None |
| Committee decision text | Conditions affect project economics | None |
| Meeting participant names (139 per plan) | Identify developers, architects, lawyers | Partial: active_construction has executor_name |
| Plan documents (31+ PDFs) | Regulations contain developer name, building heights, parking | Land Authority PDFs (if you have the file ID) |
| Plan explanation text (דברי הסבר) | Urban renewal rationale, context | None |
| Detailed affected addresses | All house numbers per plan | XPLAN has polygon but not individual addresses |
| Related plans with relationship types | Plan history and amendments | None |

**Status:** **Partially integrated** (April 2026). Bulk extraction via Playwright script (`scripts/sync-mavat-explore.ts`) populates the `mavat_plan_data` table. Query tool: `mastra/tools/queries/mavat-plan-data.ts` (`queryMavatPlanData`, `queryMavatOppositions`, `queryMavatCommitteeActivity`). Used by `scoreProject` (developer/architect/opposition/committee-activity data), `propertyReport` (developer profile), and `analyzeOppositions` (opposition deep-dive). Live/real-time SV4 API calls still require reCAPTCHA.

---

## 3b. MAVAT PublishingTextAPI (NO reCAPTCHA — discovered April 2026)

**Base URL:** `https://mavat.iplan.gov.il/PublishingTextAPI/PublishingText`
**Auth:** None! Free JSON API, no reCAPTCHA needed.
**Discovered by:** Extracting fetch() calls from the PublishingTextFE React app bundle (`/PublishingTextFE/static/js/main.6afca457.js`).

This is a **separate API from the SV4 REST API**. It powers the "נוסח פרסום מקוון" (Online Publishing Text) page at `https://mavat.iplan.gov.il/PublishingTextFE/?planNumber={planNumber}`.

### Endpoints

#### `/Plan/Info?planNumber={planNumber}`

Returns plan metadata including **every affected address** — the only structured API that provides building-level address-to-plan mapping.

```json
{
  "name": "בי/2/591- פינוי בינוי כ\"ט בנובמבר...",
  "number": "502-0749986",
  "masterId": "5001003681",
  "goals": "התחדשות עירונית...",
  "place": "שטח התכנית גובל...",
  "planAddress": [
    { "street": "כ\"ט בנובמבר", "city": "בת ים", "houseNumber": "40", "houseLetter": " " },
    { "street": "אסירי ציון", "city": "בת ים", "houseNumber": "1", "houseLetter": " " }
  ],
  "blocks": [
    { "block": "7178", "parcels": "2 - 4, 21 - 23, 38", "parcelsType": "חלקות" }
  ],
  "regionalCommitteeTel": "074-7697335",
  "spatialCommitteeTel": "03-5556030",
  "spatialCommitteeAddress": ["ועדה מקומית..."],
  "regionalCommitteeAddress": "...",
  "regionalCommitteeEmail": "tlv1-tichnun@iplan.gov.il",
  "regionName": "תל-אביב",
  "localAreaPlan": "בת ים",
  "status": 3010,
  "entityType": "תכנית מתאר מקומית",
  "committeeChairmanFirstName": "עודד",
  "committeeChairmanLastName": "פלוס",
  "courseCode": "3",
  "lastDepositeDate": "02/22/2021",
  "committeeName": "הועדה המחוזית לתכנון ולבניה מחוז תל אביב"
}
```

**Key value:** `planAddress[]` enables **reverse lookup: given a street address, find which plan covers that building**. No other API provides this structured mapping. `blocks[]` gives gush/helka. `goals` + `place` are richer than XPLAN's `pl_objectives`.

#### `/Plan/MainSubjects?planNumber={planNumber}`

Returns array of subject category codes: `["20","50","70","60","10","15"]`. Low value — codes without labels.

#### `/Plan/MainInstructions?planNumber={planNumber}`

Returns `{ "mainInstructions": "..." }` — detailed building program text (towers, heights, units, commercial sqm). Free text, not structured fields.

### What it does NOT have

- Developer/יזם name (not in any endpoint)
- Objections, decisions, meeting participants (SV4 only)
- Plan document attachment IDs/links (SV4 only)
- Timeline dates (use XPLAN or Plan Annexes for these)

### Legacy-plan hit rate (verified 2026-04-18)

- Modern `502-XXXXXXX` plans: resolves reliably.
- Legacy `בי/…` format: **0/6 hit rate** — PublishingTextAPI does not index these. Use XPLAN `pl_name LIKE` fallback or MAVAT SV4 instead.

### Status

**INTEGRATED** (April 2026) via `mastra/tools/queries/mavat-publishing-queries.ts`. Used by:
- `planDetail` tool — enriches plan view with addresses, blocks, building instructions, committee chairman
- `searchByAddress` tool — checks if user's specific building (street + house number) is covered by found plans, returns per-plan address coverage with street-level detail

**Gotcha discovered during integration:** Some plans return HTTP 200 with an empty body instead of 404. The query module handles this by reading the response as text first and checking for empty string before JSON.parse.

---

## 3c. Developer Identification — Exhaustive Source Audit (April 2026)

Comprehensive audit of all government and public sources for developer/יזם per-project data:

| Source | Has developer? | Details |
|--------|:---:|---------|
| CKAN urban_renewal (17 fields) | **NO** | Confirmed from raw API. |
| XPLAN Layer 1 (50 fields) | `pl_objectives` only | Free text regex. No dedicated field. |
| Plan Annexes FS (29 fields) | **NO** | `PL_GOALS` doesn't mention developers. |
| VATMAL (`megish`) | **Rarely** | Usually "רמ"י" or municipality. |
| CKAN active_construction | `executor_name` | 13% match by street (113/864 PB projects). |
| CKAN lottery | `provider_name` | <1% match rate. |
| Land Authority PDFs (Section 1.8) | **YES** | Explicit "יזם", "שם תאגיד", architect. Needs fileId. |
| MAVAT SV4 (`planDetails`, `rsDesInvited`) | **YES** | Submitter, 139 participants. Needs reCAPTCHA. |
| MAVAT PublishingTextAPI | **NO** | 3 endpoints, none have stakeholders. |
| Web search (Firecrawl) | **YES** (~80%) | `"{planNumber}" יזם {city}`. 4-10s latency. |
| All 45 iplan ArcGIS services | **NO** | All checked. |
| All 142 arcgis.com services | **NO** | All checked. |
| GIS ZIP datasets (data.gov.il) | Unknown | Requires Google auth. |

**Third-party:** `tabanow.co.il/תבע/{city}/{planNumber}` — plan details, no developer. OpenCorporates (`opencorporates.com/registers/119`) — partial Israeli company data. BDI `bdicode.co.il/category/urban-renewal/פינוי-בינוי/` — PB company ratings, no API.

**Enriching a known developer_name → ח.פ:** See [`ckan.md`](ckan.md) §6 (ICA Companies Registry / רשם החברות). The registry is open via CKAN but **name→ח.פ resolution is ambiguous** because each real-estate group operates per-project SPVs (`בוני התיכון` → 69 SPV rows, `אזורים` → 53). Safe for ח.פ-known enrichment (status, liquidation, violator flag); unsafe for attribution without a project-specific disambiguator. Full caveat + SPV samples in `fixtures/companies-registry/findings.md`.

---

## 11. MAVAT REST API — Investigation Results (2026-04-02)

**URL:** `https://mavat.iplan.gov.il/rest/api/...`
**Status:** COMPLETELY BLOCKED — all endpoints require reCAPTCHA v3 token

### What we know from the Angular SPA bundle

The compiled `main.*.js` bundle reveals internal components: `Decision`, `DecisionDoc`, `DecisionFiles`, `Attachment`, `AttachmentData`, `Objection`. The SPA uses:
- reCAPTCHA v3 (invisible, site key: `6LeUKkMoAAAAAH4UacB4zewg4ult8Rcriv-ce0Db`)
- Angular with Govmap API integration
- REST endpoints under `/rest/api/SV4/...`

### Endpoints tried (all return 404 without captcha token)

```
/rest/api/SV4/1/{mp_id}/{tabId}     → 404 (plan detail by tab)
/rest/api/SV4/treeIndex/{mp_id}     → 404 (plan navigation)
/rest/api/Attacments?ession={mp_id} → 404 (attachments)
/rest/api/SV4/Decisions/{mp_id}     → 404
/rest/api/SV4/Objections/{mp_id}    → 404
/rest/api/MpDetail?planId={mp_id}   → 302 → maintenance
```

**Tab IDs:** 100=summary, 200=details, 310=objections, 400=discussions

### To access: needs browser automation with reCAPTCHA v3 solve

The reCAPTCHA v3 is invisible (auto-resolves in real browsers). A Playwright approach could:
1. Load the MAVAT SPA page
2. Wait for reCAPTCHA to auto-resolve
3. Capture the token from network requests
4. Use the token for direct API calls

**Not integrated. Would need Playwright-based scraping.**
