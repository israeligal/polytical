# Spec — Correct politician roles + admit non-MK ministers

> Status: **Draft for review** · Author: Gal + Claude · Date: 2026-06-11
> Builds on: `docs/decisions/knesset-data.md`, the `knesset-odata` skill (+ `references/api-catalog.md`).
> Sibling work already shipped: PR #43 (current-term + lifetime activity counts).
> Every API fact below was live-verified against `ParliamentInfo.svc` on 2026-06-11.

## Problem

Two real, related defects on politician cards:

1. **Ministers show a generic role.** The ingest derives `roleHe` from
   `KNS_Position.Description`, which for any minister is the bare word **"שר"** — it
   **drops `DutyDesc`**, the field carrying the real title. So Israel Katz shows "שר"
   instead of **"שר הביטחון"**, Yariv Levin "שר" instead of **"שר המשפטים"**, etc.
   Verified: all 28 current minister-role rows carry a specific `DutyDesc`.

2. **Non-MK ministers are missing entirely.** The roster is built only from people with a
   current Knesset seat (`PositionID 43/61`). But under the **Norwegian Law** (החוק
   הנורבגי) several ministers resigned their Knesset seat while remaining ministers — so
   they have a current `PositionID 39` (minister) but no `43/61`. They are excluded from
   the app. Verified: **9 such ministers right now**, including the **Finance Minister
   (Smotrich)** and **Foreign Minister (Sa'ar)** — major figures with no card.

## The governing rule (resolves "who is on the page")

Three buckets, by what office the person currently holds (Knesset seat = `43/61`,
ministry = `39/45`):

| Bucket | Test | Treatment |
|---|---|---|
| **Sitting MK** | has a current seat (43/61) | `active=true` · role from API (חבר הכנסת / committee chair / minister-with-seat title) |
| **Minister, no seat** (Norwegian Law) | current minister (39/45), no current seat | `active=true` · **ministry title** + **"נורבגי" chip + ⓘ** |
| **Truly out** | neither a current seat nor a current ministry | **`active=false`** · role = **"…לשעבר"** (former + last role) · **faction left empty** |

The gallery (active set) is therefore **~129 current office-holders** (≈120 sitting MKs +
9 non-MK ministers). Departed people are **kept but inactive**, shown as "former <last
role>" — they don't appear in the active gallery but their card still resolves.

**Critical distinction (the recurring confusion):** a non-MK minister like **Sa'ar is
NOT "truly out"** — he holds a current ministry (שר החוץ), so he is **active**, bucket 2.
"Former" applies only to bucket 3 (no seat AND no ministry).

## Verified data this rests on

| Fact | Evidence (live 2026-06-11) |
|---|---|
| Minister rows carry the real title in `DutyDesc` | `KNS_PersonToPosition` Pos 39 → `DutyDesc:"שר החוץ"` etc. (28 rows) |
| Minister rows are tagged `KnessetNum=25`, `GovernmentNum=37` | so the **existing** members fetch (`KnessetNum eq 25`) already returns them — they're only filtered out downstream |
| 9 current ministers hold no `43/61` seat | Sa'ar(1027), Smotrich(30055), Eli Cohen(30083), Kisch(30057), Zohar(30058), Chikli(30786), Eliyahu(30857), Haim Katz(556), Amsalem(23564) |
| Some ministers hold multiple portfolios | Levin(12951) has 4; "שר נוסף…"/"…המקשר…" are secondary qualifiers |
| Zero ministers-without-portfolio today | no Pos 39 row has a bare/blank `DutyDesc` |
| Seat-less ministers may lack a current faction (Pos 54) | Sa'ar's only current position is Pos 39 → `party` would be null (see Open Question 2) |
| PM is Pos 45 → "ראש הממשלה" | Netanyahu(965) |

## Design

### 1. Roster inclusion (`app/lib/knesset/normalize.ts` — `normalizeK25Members`)
Today a person enters the roster iff they have a current `43/61`, `active=true`. Change to
the three-bucket model:

- Current seat (43/61) **or** current ministry (39/45) → include, **`active=true`**.
- A K25-tenured person with **neither** → include, **`active=false`** (former), role =
  "<last role> לשעבר", faction empty. *(K25 departed persons are already ingested with
  `active=false` by the votes-feature roster extension; this step sets their former-role
  label rather than dropping them.)*
- The members fetch already returns minister rows (`KnessetNum=25`), so no fetch change for
  bucket 2; bucket 3 reuses the existing departed-MK rows.

### 2. Role resolver (the core fix — `normalize.ts`)
Replace `roles[0]` (arbitrary first non-43/61/54 label) with a **seniority-ranked**
resolver that returns the headline role, using `DutyDesc` for ministerial posts:

| Rank | Position | Label source |
|---|---|---|
| 1 | PM (45) | "ראש הממשלה" |
| 2 | Minister (39) / fem. (57) | **`DutyDesc`** (specific portfolio); **bare/empty `DutyDesc` → "שר ללא תיק" / "שרה ללא תיק"** (no ⓘ — the label alone is enough) |
| 3 | Deputy minister (40/59) | `DutyDesc` ("סגן שר X") |
| 4 | Speaker (122) | `Description` ("יושב–ראש הכנסת") |
| 5 | Deputy Speaker (70) | `Description` |
| 6 | Faction chair (48) | `Description` ("יו״ר סיעה") |
| 7 | Committee chair | `Description` |
| 8 | Plain MK (43/61) | "חבר/ת הכנסת" (the existing fallback) |

> Verified: there is **no distinct "שר ללא תיק" PositionID** — Pos 39 = generic "שר", the
> portfolio is in `DutyDesc`, and the API never emits the literal "ללא תיק". So
> "without-portfolio" = a Pos-39 row whose `DutyDesc` is empty/bare "שר". Currently **0**
> such ministers (all 28 carry a real portfolio); the rule is defensive but correct.

- **Multi-portfolio ministers:** pick the **primary** = first `DutyDesc` that is NOT a
  secondary qualifier (drop titles starting "שר נוסף", "השר המקשר", "השר לשיתוף פעולה").
  If still multiple, take the first. (e.g. Levin → "שר המשפטים".) Keep the full list in
  `facts` for completeness.
- `DutyDesc` is the specific minister title; this single change fixes both seated and
  seat-less ministers.
- **Inactive (bucket 3):** resolve the same headline role from the person's **most recent**
  (now-ended) position, then suffix **" לשעבר"** → e.g. "שר החוץ לשעבר", "חבר הכנסת לשעבר".

### 3. The "minister without a seat" indicator (the Norwegian-law flag)
A seat-less minister = included via 39/45 **and** has no current 43/61. Surface this on the
card so users understand he's a minister who isn't an MK:

- **Stored:** add a boolean column `politicians.isNonMkMinister` (or derive at read time —
  see Open Question 3). Set true when the person has a current minister/PM position and no
  current seat.
- **Card UI (decided):** role line = the ministry title + a small **"נורבגי"** chip + a
  **ⓘ** affordance. The punchy word is visible; the ⓘ carries the precise meaning.
  Example: `שר החוץ · נורבגי ⓘ`.
- **ⓘ tooltip copy (one sentence, accurate):**
  > "שר נורבגי — שר שאינו חבר הכנסת: לפי החוק הנורבגי הוא התפטר ממושבו, ח״כ מסיעתו נכנס
  > במקומו, והוא ממשיך לכהן כשר."

### 4. Caricature-card impact (the image-regeneration list)
Caricature cards bake the role string into the art (`caricature-cards` skill). When a role
label changes, the PNG is stale. Deliverable = an explicit, generated list:
- **Role text changed → regenerate:** every seated minister now showing generic "שר"
  (≈19) whose card exists.
- **Brand-new cards:** the 9 non-MK ministers (no card today), if/when we want art for them
  — until then they use the styled fallback (`imageUrl` null).
- Output the list from the DB after re-ingest (compare old `roleHe` → new); regeneration
  itself is a separate, manual `caricature-cards` task, not part of this PR.

### 5. Ingest + data
- Re-run the bounded ingest (`members` step) so roster + roles refresh. Re-ingest is
  idempotent; `isNonMkMinister` recomputed each run.
- Prod populate is the usual deliberate single-DB op (per `single-prod-db-no-dev`),
  gated on explicit confirmation.

## Tests (PGlite, real Drizzle)
- A current minister with a seat → `roleHe` = his `DutyDesc`, not "שר".
- A multi-portfolio minister → primary portfolio chosen, secondaries excluded from the headline.
- A seat-less minister (39, no 43/61) → included, `active=true`, `isNonMkMinister=true`,
  role = his ministry.
- A plain MK → "חבר/ת הכנסת" unchanged.
- A person with no current office → not in the roster.
- (Defensive) a bare-"שר" minister → "שר ללא תיק".

## Non-goals
- **Deputy ministers** get no special case in v1 (they're MKs anyway); rank them under
  faction/committee chairs only if it comes up.
- **No editorial "party leader" concept** (e.g. labelling Sa'ar leader of New Hope) — we
  show only the official faction-chair (Pos 48) the API reports, per the sourcing rule.
- **No image generation in this PR** — we produce the regeneration *list*; art is a
  separate manual pass.
- **No change to the votes/matching feature** — non-MK ministers will have thin/empty
  roll-call records (they don't vote in plenum); show the existing honest empty state.

## Resolved decisions (all final — 2026-06-11)
- **נורבגי chip + ⓘ** only for seat-less ministers (bucket 2). The ⓘ tooltip is the
  one-sentence meaning above.
- **שר ללא תיק** label for a bare/empty-`DutyDesc` minister — **no ⓘ**, the label alone.
  (Grounded: that's how the API would represent a portfolio-less minister; 0 today.)
- **Party = empty** whenever there's no current faction (seat-less ministers *and*
  former/inactive people) — never back-fill a last faction.
- **Truly-departed** (no seat, no ministry) → **`active=false`**, role = "<last role>
  לשעבר".
- **No new column.** Persist the Norwegian flag (+ any former-role marker) inside the
  existing **`facts` JSONB** (`facts.isNorwegianMinister: true`), set in `normalizeK25Members`.
  No migration; `dbToCard` reads `facts` already. Keep `roleHe` = the official title only
  (the נורבגי chip is presentational, driven by the flag) so search/caricature reuse stay clean.
- **Multi-portfolio:** primary = first `DutyDesc` not starting with "שר נוסף"; fallback
  first. (Levin → "שר המשפטים".) Full list stays in `facts`.
- **Phasing:** all three buckets ship in **one PR**.
- **Caricatures:** non-MK ministers use the styled fallback (`imageUrl` null) until art is
  made; the PR emits the regeneration list, art is a separate manual pass.

## Source-of-truth invariants (unchanged)
- Roles/titles resolve by stable `PositionID` + `DutyDesc` from official OData; never a
  guessed or hand-typed title (except the static ⓘ explainer copy, which is UI chrome, not
  a per-person fact).
- Every politician row keeps its provenance triplet; re-ingest is idempotent.
