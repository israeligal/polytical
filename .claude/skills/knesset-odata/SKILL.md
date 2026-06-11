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

## Provenance / re-verification

| Claim | How verified (2026-06-11) |
|---|---|
| `$inlinecount=allpages` total == true row count | `scripts/knesset_activity.py --cross-check`, Ohana 30300 + Liberman 427, both entities, both scopes — all `match: true` |
| Ohana 2/213 bills, 0/11 queries; Liberman 301/532 bills, 2/3 queries | live `odata.count`, cross-checked vs full pagination |
| `$count=true` unsupported; `/$count` works (plaintext) | live: `$count=true` → HTTP 400 "not recognized"; `/$count` → HTTP 200 bare int (415 only when `Accept: application/json` forced) |
| `KNS_BillInitiator` has no `KnessetNum`; `$expand=KNS_Bill` carries it | live sample row keys |
| Knesset 25 current | `KNS_Bill KnessetNum eq 26` → 0 rows |
| name collision 30300 vs 585 | live `KNS_Person LastName eq 'אוחנה'` |

If any number here ever looks off, **re-run the script before believing the doc** — the
Knesset publishes continuously and the current-Knesset number will change when the 26th is
seated.
