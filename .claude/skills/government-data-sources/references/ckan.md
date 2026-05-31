# data.gov.il CKAN API

**Base URL:** `https://data.gov.il/api/3/action/datastore_search`
**Auth:** None
**Rate limit:** Generous

## 5. Key Datasets & Resource IDs

See `app/lib/constants.ts` for all resource IDs. Key ones:

| Dataset | Resource ID | Developer Field? |
|---------|------------|-----------------|
| Urban Renewal (PB) | `f65a0daf-...` | **NO** — has plan number, units, status, but no developer |
| Active Construction | `b072e36c-...` | **YES** — `executor_name`, `executor_id` |
| Lottery (Dira BeHanacha) | `7c8255d0-...` | **YES** — `ProviderName` |
| Contractors Registry | `4eb61bd6-...` | **YES** — `shem_yeshut` (entity name) |
| Construction Progress | `1ec45809-...` | **NO** — milestone dates only |
| Development Costs | `bf164a03-...` | **NO** |

## CKAN Query Patterns

```
# Full-text search (Hebrew)
GET /datastore_search?resource_id={id}&q=בת+ים&limit=100

# Exact filter (careful with whitespace!)
GET /datastore_search?resource_id={id}&filters={"yeshuv":"בת ים"}&limit=100

# Pagination
GET /datastore_search?resource_id={id}&offset=100&limit=100
```

**Gotcha:** Use `q` (full-text) for Hebrew search, NOT `filters` (requires exact whitespace match).

**22 resources defined in `constants.ts`, 20 synced to PostgreSQL.** 2 NOT synced:
- `RESOURCE_LOTTERY_NO_DRAW` (`ea93b3c9-...`) — lottery projects without draws (in `VALID_RESOURCE_IDS` for on-demand query, but not bulk-synced)
- `RESOURCE_SCHOOL_DIRECTORY` (`5548fd63-...`) — school metadata beyond coordinates (also only on-demand)

**Integrated in:** `app/lib/ckan-client.ts`, synced via `scripts/sync-ckan-to-pg.ts`

---

## 6. רשם החברות — Israeli Corporations Authority (ICA)

**Not integrated yet.** Probed 2026-04-23. Primary candidate for resolving `mavat_plan_data.developer_company_id` (currently 1/513 populated) when a ח.פ is already known — **not** as a name→ח.פ discovery tool (see SPV caveat).

| Package | Resource ID | Rows | Notes |
|---|---|---:|---|
| `ica_companies` | `f004176c-b85f-4542-8901-7b3176f9a054` | **723,682** | All registered companies. Primary source. |
| `ica_partnerships` | `139aa193-fabb-4f6b-a71b-0bb40fd73eb2` | 28,460 | Partnerships (`שותפות`). Rare for PB but some JVs live here. |
| `ica-changes` | `28780ab5-3ef1-44c7-8377-da82c0aa6781` | 514,879 | Change-log: name changes, share allocations, liens. |
| `membership-in-liquidation` | `6f3f0df3-5968-4135-81c5-8dd76bf89410` | — | Companies currently in liquidation — **developer-health red flag**. |
| `mashkonot` | `e7266a9c-fed6-40e4-a28e-8cddc9f44842` | — | Pledges/liens ledger. Low value for our use case. |
| `companiespersonscleansing20200` | `4013dda7-be38-4ab8-8822-5afe733b429b` | — | Dormant-entity cleanup. Low value. |

**ica_companies schema** (30 fields): `מספר חברה` (9-digit ח.פ), `שם חברה`, `שם באנגלית`, `סוג תאגיד`, `סטטוס חברה` (פעילה / מחוקה / מפרקה), `מטרת החברה`, `תאריך התאגדות` (DD/MM/YYYY), `מגבלות`, `מפרה` (violator flag), `שנה אחרונה של דוח שנתי`, registered address (`שם עיר`, `שם רחוב`, `מספר בית`, `מיקוד`, `ת.ד.`), `תת סטטוס`, and 9 code columns (`קוד סטטוס חברה`, `קוד סוג חברה`, `קוד ישוב`, etc.).

### Critical caveat — SPV pattern breaks name lookup

Every Israeli real-estate group operates per-project SPVs. A full-text search for `בוני התיכון` returns **69 hits** — one parent + 68 per-project subsidiaries (`בוני התיכון פינוי בינוי רמלה (פרנקל) בע~מ`, `בוני התיכון פינוי בינוי רמת השרון (אוסישקין) בע~מ`, …). `אזורים` → 53 hits, `אפריקה ישראל מגורים` → 13 hits.

**Implication**: a naive `developer_name → company_number` join yields N candidate ח.פ values per MAVAT plan, none uniquely correct. Storing the parent ח.פ as "this project's developer SPV" is false attribution (reputation rule). See `fixtures/companies-registry/findings.md` for the four match-strategy options (A brand+city+plan-token / B group-ח.פ with explicit label / C read-time enrichment only / D skip).

### Encoding quirks

- The gershayim `״` is stored as `~` → `בע״מ` reads as `בע~מ`. Normalize on read: `.replace(/~/g, "״")`.
- `שם עיר` is canonical CBS (`תל אביב - יפו` with spaces around the dash). Match against our city-alias whitelist, never inline.
- Dates are `DD/MM/YYYY`, not ISO.
- Field-name symmetry isn't guaranteed across resources — `ת.ד.` (companies) vs `ת.ד` (partnerships).

### Query patterns

```
# Full-text (handles Hebrew correctly — prefer over filters)
GET /datastore_search?resource_id=f004176c-b85f-4542-8901-7b3176f9a054&q=בוני+התיכון&limit=100

# Exact ח.פ lookup
GET /datastore_search?resource_id=...&q=515991032&limit=1
```

**Sample fixtures**: `fixtures/companies-registry/ica_companies.json`, `ica_partnerships.json`, `ica_changes.json`, `spv_pattern_boni_hatichon.json`.

---

## 9. data.gov.il — Planning Administration Datasets

Searched data.gov.il for מינהל התכנון (Planning Administration). Found 12 results but **almost all are just links to web services**, not structured data files:

| Dataset | Format | Useful? |
|---------|--------|---------|
| תוכניות מקוונות (Online Plans) | ZIP (Xplan geodata) | Maybe — full XPLAN as downloadable geodatabase |
| חוקרים לשמיעת התנגדויות | XLSX | Low — list of objection hearing researchers, not actual objections |
| מרחבי תכנון | Link to MAVAT | No — just a link |
| שירותי מפה תכנוניים | Link + DOCX | Reference — DOCX documents the services catalog |

**Key finding:** The Planning Administration does NOT publish structured plan data (objections, decisions, participants) on data.gov.il. This data lives exclusively in MAVAT's WAF-protected API.
