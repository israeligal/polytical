---
name: knesset-odata
description: >-
  Get an Israeli MK's parliamentary-activity counts — bills (הצעות חוק) and queries
  (שאילתות), split into the current Knesset vs their whole career (lifetime) — from the
  official Knesset OData service, cheaply (one count-call per number, no row downloads).
  Use this skill WHENEVER the task involves how many bills/laws an MK proposed, how many
  queries they filed, "current term vs lifetime" activity, resolving a politician's Knesset
  PersonID from the official OData (KNS_Person) by name, checking which Knesset is current,
  or wiring any of that into a politician card / profile — even if the user just says "his
  real numbers are wrong",
  "show everything he did", "get the totals for the card", or "אמיר אוחנה עשה יותר מ-2
  הצעות חוק". Also use before adding/editing any KNS_BillInitiator / KNS_Query /
  KNS_Person OData query, so you copy the verified filter shapes instead of guessing.
---

# Knesset OData — per-politician activity (current term + lifetime)

The official Knesset OData service can give you, **in one cheap HTTP call per number**,
how many bills and queries an MK is tied to — split into the current Knesset and their
lifetime total. This is exactly what a politician card needs to stop showing a Speaker or
ex-minister "2 הצעות חוק" as if that were their whole career.

**Everything in this skill was cross-checked against the live service on 2026-06-11** —
each `odata.count` was proven equal to the true paginated row count, for two different MKs
(Amir Ohana 30300 and Avigdor Liberman 427), both entities, both scopes. The bundled
`scripts/knesset_activity.py` *is* that proof — run it (and its `--cross-check`) any time
you doubt a number. Do not add claims here you have not run yourself.

> **Full entity catalog:** this skill covers the per-MK *activity-count* recipe. For the
> complete catalog of all 38 ParliamentInfo.svc entities (plus Votes.svc) — every entity's
> key fields, navigation properties, example query, and verified OData gotchas (counts,
> `substringof` vs `contains`, paging, encoding) — see
> [`references/api-catalog.md`](references/api-catalog.md).
>
> **What more can we get (untapped):** the catalog's
> [Untapped data & feature opportunities](references/api-catalog.md#untapped-data--feature-opportunities-verified-2026-06-15)
> table (verified 2026-06-15) maps the entities we DON'T ingest to what they could power —
> bill genealogy (split/union), former initiators, enacted laws + a real **topic taxonomy**
> (laws only), committee sessions, and plenum transcripts ("דברי הכנסת").

## The one base URL

```
https://knesset.gov.il/Odata/ParliamentInfo.svc/
```

OData **v4**, public, read-only. Same service the app already ingests from
(`app/lib/knesset/odata.ts` → `PARLIAMENT_BASE`). **Not** `Votes.svc` (that's frozen at the
24th Knesset). System of record per `docs/decisions/knesset-data.md`.

## The core recipe — 4 numbers for one PersonID

Append `$inlinecount=allpages&$top=1` to a filtered query and read the total off
`odata.count`. You get the count **without** the service sending the rows.

| Number | Entity + filter |
|---|---|
| Bills, **lifetime** | `KNS_BillInitiator?$filter=PersonID eq <id>` |
| Bills, **current term** | `KNS_BillInitiator?$filter=PersonID eq <id> and KNS_Bill/KnessetNum eq <N>` |
| Queries, **lifetime** | `KNS_Query?$filter=PersonID eq <id>` |
| Queries, **current term** | `KNS_Query?$filter=PersonID eq <id> and KnessetNum eq <N>` |

Each row above is one call; add `&$inlinecount=allpages&$top=1&$format=json`.

Verified example (one call, copy-paste):
```bash
curl -sG "https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_BillInitiator" \
  --data-urlencode "\$filter=PersonID eq 30300" \
  --data-urlencode "\$inlinecount=allpages" \
  --data-urlencode "\$top=1" \
  --data-urlencode "\$format=json"
# -> "odata.count":"213"   (Amir Ohana, lifetime bills)
```

Or just use the script:
```bash
python3 scripts/knesset_activity.py 30300            # {bills 2/213, queries 0/11}
python3 scripts/knesset_activity.py 30300 --cross-check   # re-proves vs pagination
```

## Gotchas that will bite you (all observed live, not theory)

- **`odata.count` is a STRING** (`"213"`, not `213`). Coerce with `int()` / `Number()`.
- **`KNS_BillInitiator` has NO `KnessetNum` field.** To scope bills to a Knesset you must
  filter through its navigation property: `KNS_Bill/KnessetNum eq <N>`. `KNS_Query` *does*
  carry its own `KnessetNum`, so it filters directly. (Don't mix these up.)
- **Split/government bills have NO MK initiators — by design, not a data gap.** A `ממשלתית`
  (government) bill, and especially a budget bill split into many child bills (the typical
  "על סדר היום" agenda item), returns **0** rows from `KNS_BillInitiator` (verified: BillID
  2227233 → 0). The proposing entity is the *government*, not MKs. The split child's lineage —
  and any initiators — live on the **parent** bill: `KNS_BillSplit?$filter=SplitBillID eq <id>`
  → `MainBillID` (verified: 2204244 → 2203821). So "who made it" is empty for most agenda
  items, correctly; only private (`פרטית`) bills carry MK initiators (verified: 2233112 → 3).
- **Counting: use `$inlinecount=allpages` OR the `/$count` path — never `$count=true`.**
  `$count=true` is unsupported here (HTTP 400, *"'$count' … is not recognized"*). The other
  two both work and both return the total *without* the rows:
  - `…?$filter=…&$inlinecount=allpages&$top=1&$format=json` → JSON carrying `odata.count` (a
    **string** — `int()` it). This is the default: it parses alongside your other JSON and is
    what the bundled script uses.
  - `…/$count?$filter=…` → a **bare plaintext integer**, HTTP 200. Lighter, but it **415s if
    you send `Accept: application/json`** (it answers `text/plain`) — so omit that header or
    send `Accept: text/plain`. That footgun (a JSON `Accept` → 415) is the only reason to
    prefer `$inlinecount` for a JSON pipeline; the count itself is identical.
- **URL-encode spaces as `%20`, not `+`.** The service rejects `+`. `curl --data-urlencode`
  and Python's `urllib.parse.quote` both do the right thing; JS `URLSearchParams` does not
  (it form-encodes spaces as `+`) — the app's `buildODataUrl` hand-encodes for this reason.
- **PersonID name-collisions are real.** `KNS_Person?$filter=LastName eq 'אוחנה'` returns
  *two* people (`30300` אמיר אוחנה, IsCurrent=true; `585` אשר אוחנה, IsCurrent=false).
  Resolve by `PersonID`, never by Hebrew string — the project's stable-id rule.

## Resolving a politician's PersonID

```bash
curl -sG "https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_Person" \
  --data-urlencode "\$filter=LastName eq 'אוחנה'" --data-urlencode "\$format=json"
# -> rows of {PersonID, FirstName, LastName, IsCurrent}
```
In the Polytical DB the PersonID is `politicians.personId` (the route id) — prefer reading
it there over re-querying by name.

## An MK's role / job title (and ministers)

A person's positions live in `KNS_PersonToPosition` (`PositionID`, `IsCurrent`, `DutyDesc`,
`FactionID`). **The real minister title is in `DutyDesc`, NOT `KNS_Position.Description`** —
Description for Pos 39 is the generic "שר"; `DutyDesc` is "שר הביטחון" / "שר החוץ".

Verified `PositionID` map: **45** ראש הממשלה · **39/57** שר/שרה · **40/59** סגן/סגנית שר ·
**122** יו״ר הכנסת · **70** סגן יו״ר · **48** יו״ר סיעה · **43/61** חבר/ת הכנסת · **54** חבר/ת סיעה (party).

**Norwegian Law:** a minister can hold office without a Knesset seat — current Pos 39 but no
current 43/61 (e.g. Sa'ar=שר החוץ, Smotrich=שר האוצר). Minister rows are tagged
`KnessetNum=25`, so the standard roster fetch already returns them.

In Polytical, **all of this is computed in `normalizeK25Members` and refreshed by the
canonical `pnpm ingest:knesset --only=members`** — do not write a parallel role/minister
script. Full rules + rationale: `docs/decisions/knesset-data.md` (2026-06-11 entry).

## Which Knesset is current?

Verified method (no guessing): a Knesset is current if it has bills and the next one does
not. As of **2026-06-11 the current Knesset is 25** (`KNS_Bill KnessetNum eq 26` → 0 rows).
`scripts/knesset_activity.py` defaults to 25; `assert_current_knesset(n)` re-checks it. The
app hard-codes this as `KNESSET_NUM = 25` in `scripts/ingest-knesset.ts`.

## If you need the actual rows (names), not just counts

The counts above never download rows. When you *do* want the bills themselves (e.g. a
"הצעות חוק אחרונות" list across a career), `$expand` pulls the bill inline — verified to
carry `KnessetNum`:
```
KNS_BillInitiator?$filter=PersonID eq <id>&$expand=KNS_Bill
```
The server caps pages at 100 rows and emits a relative `odata.nextLink`; request a large
`$top` to page to exhaustion (resolve the nextLink against the base). The app already has
this paging in `fetchAll` (`app/lib/knesset/odata.ts`); reuse it rather than re-rolling.

Verified navigation properties (from `$metadata`): `KNS_Person` → `KNS_BillInitiators`,
`KNS_BillHistoryInitiators`, `KNS_PersonToPositions`, `KNS_Agendas`, `KNS_AgendaMinistries`,
`KNS_Queries`; `KNS_BillInitiator` → `KNS_Bill`, `KNS_Person`; `KNS_Query` → `KNS_Person`,
`KNS_GovMinistry`, `KNS_Status`, `KNS_DocumentQueries`.

## Bill detail: documents, status, and the public page (verified live 2026-06-13)

For a full bill page you want the bill **plus its document links plus its status text**. A
single **nested `$expand`** gets bill + documents inline, per MK:
```
KNS_BillInitiator?$filter=PersonID eq <id>&$expand=KNS_Bill/KNS_DocumentBills
```
- **Nested `$expand` works**, and the `/` survives percent-encoded as `%2F` — `buildODataUrl`'s
  `encodeURIComponent` emits `KNS_Bill%2FKNS_DocumentBills` and the server returns the bill
  inline with a `KNS_DocumentBills` array. `fetchAll` now takes an `expand` arg.
- **`KNS_DocumentBill`** = `{DocumentBillID, BillID, GroupTypeID/Desc, ApplicationID,
  ApplicationDesc ("PDF"|"DOC"), FilePath, LastUpdatedDate}`. `DocumentBillID` is Int64 in
  `$metadata` but **serializes as a JSON number** (~1e7, JS-safe) — *not* a string. One
  `DocumentBillID` yields one row **per format** (PDF + DOC). **`FilePath` → `fs.knesset.gov.il`**
  is a plain file host (HTTP 200, real PDF/DOCX, **NOT** WAF'd) — but the API sometimes emits a
  leading **double slash** (`https://fs.knesset.gov.il//25/law/…`); it still resolves, store
  verbatim. Corpus-wide: **0** docs with a null `FilePath`.
- **`KNS_Status`** (81 rows; bill/query/committee status lookup) = `{StatusID, Desc, TypeID,
  TypeDesc}`; `StatusID` is unique across the 81. **Gotcha: some rows have a `null` `Desc`**
  (observed 6015/6016/6017) — coalesce to `""` (or skip) before writing a NOT-NULL column, or the
  whole batch upsert aborts. Also **0** `KNS_Bill` rows have a null `Name`.
- **Public bill page (outbound link):** `https://main.knesset.gov.il/apps/legislation/main/bills/<BillID>`
  (canonical; legacy `…/LawBill.aspx?t=lawsuggestionssearch&lawitemid=<BillID>` 301-redirects to
  it). **`main.knesset.gov.il` is behind a Reblaze WAF** — curl/headless gets a ~477-byte
  `kramericaindustries` JS challenge (status "247"), so you can't scrape it; a real browser
  passes. (`fs.knesset.gov.il` is a separate host, not WAF'd.)

## Wiring counts into Polytical (the card use-case)

The card's "פעילות פרלמנטרית" comes from `getPoliticianActivity()`
(`app/lib/politicians/repo.ts`), which today counts only rows in our K25-scoped `bills` /
`queries` tables — so lifetime activity is invisible. To show **current + lifetime**:

1. Add four count columns to `politicians` (e.g. `billsCurrent`, `billsLifetime`,
   `queriesCurrent`, `queriesLifetime`), each with the usual provenance triplet
   (`sourceUrl` = the inlinecount query URL, `fetchedAt`). These are official exact-id
   counts, so storing the aggregate honors the sourcing rule.
2. Add a **light** ingest step that, per current MK (`politicians.personId`), makes the
   four `$inlinecount` calls and upserts the columns. It's tiny (~4 calls × ~120 MKs), so
   it can live in the default bounded ingest, not behind `--full` — there is no
   "download every Knesset" cost.
3. `getPoliticianActivity()` returns both buckets; the UI shows
   `בכנסת ה-25: 2 הצעות · 0 שאילתות` and `בסך הכל: 213 הצעות · 11 שאילתות`.

TS count helper (mirror the app's encoding discipline, read `odata.count` as a string):
```ts
async function odataCount({ entity, filter }: { entity: string; filter: string }): Promise<number> {
  const url = buildODataUrl({ entity, filter }) + "&$inlinecount=allpages&$top=1";
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const page = (await res.json()) as { "odata.count"?: string };
  if (page["odata.count"] == null) throw new Error(`no odata.count for ${entity} ${filter}`);
  return Number(page["odata.count"]);
}
```

> **Update (2026-06-13): shipped + scope change.** The four count columns AND the
> **bill-pages feature** are now live. Beyond counts, the bill-pages backfill stores lifetime
> bill **rows** per current MK (via the nested `$expand` above) into `bills`/`bill_sponsors`,
> plus new `bill_documents` + `bill_statuses` tables. **The `bills` table is therefore no longer
> K25-scoped — it spans every Knesset for current MKs.** Any reader that assumed K25-only MUST
> filter by `knessetNum` (fixed sites: `scripts/ingest-knesset.ts` `loadK25BillIds`, votes
> `loadAttributionContext`, and `getPoliticianActivity`'s fallback bill count).

## Provenance / re-verification

| Claim | How verified (2026-06-11) |
|---|---|
| `$inlinecount=allpages` total == true row count | `scripts/knesset_activity.py --cross-check`, Ohana 30300 + Liberman 427, both entities, both scopes — all `match: true` |
| Ohana 2/213 bills, 0/11 queries; Liberman 301/532 bills, 2/3 queries | live `odata.count`, cross-checked vs full pagination |
| `$count=true` unsupported; `/$count` works (plaintext) | live: `$count=true` → HTTP 400 "not recognized"; `/$count` → HTTP 200 bare int (415 only when `Accept: application/json` forced) |
| `KNS_BillInitiator` has no `KnessetNum`; `$expand=KNS_Bill` carries it | live sample row keys |
| Knesset 25 current | `KNS_Bill KnessetNum eq 26` → 0 rows |
| name collision 30300 vs 585 | live `KNS_Person LastName eq 'אוחנה'` |
| nested `$expand=KNS_Bill/KNS_DocumentBills` returns docs inline (`/`→`%2F`) | live, PersonID 30300 (2026-06-13) |
| `fs.knesset.gov.il` PDF/DOCX reachable (not WAF'd); `main.knesset.gov.il` WAF'd | live HTTP 200 PDF; LawBill.aspx → 477-byte JS challenge (2026-06-13) |
| `KNS_Status` 6015–6017 have null `Desc`; 0 null `KNS_Bill.Name`; 0 null doc `FilePath` | live `$inlinecount` (2026-06-13) |

If any number here ever looks off, **re-run the script before believing the doc** — the
Knesset publishes continuously and the current-Knesset number will change when the 26th is
seated.
