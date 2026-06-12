# MK Attendance & Vote-Participation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Show, per MK, **how engaged they were in the K25 plenum** — how many roll-call votes they participated in vs missed, and on how many plenum days they showed up — sourced honestly (real data where it exists; explicit "not available" where it doesn't).

**Architecture:** The vote-participation metric needs **no new API** — we already store 483,939 per-MK roll-call rows in `mk_votes` (148 MKs, 406 plenum vote-days, 2022-11-15→2026-06-10). Compute it on-read in `app/lib/votes/read-repo.ts` (mirroring `getRecentMkVotes`), tenure-scoped via `faction_stints`, and render it in the politician page's existing "הצבעות אחרונות" section. **True "days present out of days the Knesset sat"** (physical attendance) is NOT in any source we've found — a Phase-A research gate decides whether it's buildable or whether we ship the roll-call proxy / defer it.

**Tech Stack:** TypeScript, Drizzle, PGlite (`createTestDb`) + Vitest, Next 16 RSC, Tailwind v4 (logical props, OKLCH, `.nums`/`<bdi>`), Hebrew RTL.

**Worktree:** YES — isolated git worktree off `origin/main` (this repo has heavy concurrent-session churn; isolation has repeatedly prevented collisions). Set up before the first code step.

---

## 0. The honesty problem (read first — it shapes everything)

The user wants two things that have **different feasibility**:

| Ask | Feasible? | Source |
|---|---|---|
| "How many votes did he go to / not go to" | ✅ YES, now | `mk_votes` (present = has row; absent = no row in tenure window) |
| "Present X days of Y days the Knesset sat" (physical attendance) | ⚠️ NOT from any found API | requires an attendance source we don't have |

We can derive a **roll-call-presence proxy** for the second ("appeared in ≥1 roll-call on N of the M plenum-vote-days in his tenure"), but that is NOT the same as official attendance (an MK physically present who happened not to vote in any recorded roll-call that day wouldn't count; secret/hand votes have no per-MK rows). **The proxy must be labelled as roll-call participation, never as "ימי נוכחות".** Whether an official attendance source exists is the Phase-A HARD GATE.

---

## 1. Files read (research basis — all verified 2026-06-12)

| Area | Files |
|---|---|
| Votes data layer | `app/lib/votes/read-repo.ts` (`getRecentMkVotes`, `RecentMkVote`, freshness), `app/lib/votes/normalize.ts` (`WEBSITE_RESULT_BY_ID`: `6=didnt_vote/נוכח 7=for 8=against 9=abstain`), `app/lib/schema-votes.ts` (`mkVotes` PK `(voteId,personId)` + `result` enum + `mk_votes_person_idx`; `knessetVotes.voteType`/`voteDate`/`isDecisive`; `factionStints` start/finish), `app/lib/votes/CLAUDE.md` |
| Politician card | `app/politician/[id]/page.tsx` (lines 36-38 data fetch, 183-196 "הצבעות אחרונות" render), `app/lib/politicians/repo.ts` (`getPoliticianByPersonId`, `politicians.inKnessetSince`) |
| Skill / docs | `.claude/skills/knesset-odata/SKILL.md` + `references/api-catalog.md`, `.claude/skills/knesset-votes/SKILL.md`, `docs/decisions/knesset-data.md` |
| Test infra | `app/lib/testing/create-test-db.ts`, `app/lib/votes/pipeline.integration.test.ts` (PGlite harness + `nameKey` seeding), `vitest.config.ts` |

## 2. Convention compliance (root `CLAUDE.md`)

| Convention | How this plan complies |
|---|---|
| Route → Service → Repository; repos own DB access | New read goes in `app/lib/votes/read-repo.ts`; the page calls it, never `db` directly |
| Scope guard / resolve by stable id | Per-MK reads filter by `personId` (stable); never Hebrew string |
| Errors over fallbacks; absent fact = explicit "not found" | No attendance source → explicit "אין נתונים" state, never a guessed number (sourcing rule) |
| Sourcing: every fact cites official source | Participation derives from `mk_votes`, each row already carrying provenance; the motion links its `sourceUrl` |
| RORO on exported fns; no inline types | `getMkParticipation({db,personId})`; result interface defined + exported |
| Tokens/OKLCH, logical props, Hebrew, `.nums`/`<bdi>`, Asia/Jerusalem | New UI uses existing tokens + `.nums`/`<bdi>` for the "N מתוך M" run; dates via `lib/time.ts` |
| PGlite integration tests, real Drizzle, no internal mocks | New repo fn tested via `createTestDb` seeding `mk_votes`/`knesset_votes`/`faction_stints` |
| `db:push` drops migration-only indexes; declare in-schema | No new table needed for Phase B; if Phase C adds one, indexes declared in-schema |
| `assertNonProductionDb()` first line of mutating scripts | Any Phase-C ingest script starts with it (knowing the prod-host caveat) |
| Files < 500 lines | `read-repo.ts` is large — if the addition pushes it over, split participation reads into `app/lib/votes/participation.ts` |

## 3. Verified third-party signatures / API (live 2026-06-12)

**Knesset OData `ParliamentInfo.svc`** — `$metadata` grep for `presen|attend|particip|absen`: **ZERO entities**. No person↔session link exists (re-confirmed). Plenum sit-days available as `KNS_PlenumSession`/`KNS_KnessetDates` but carry **no PersonID** → cannot yield per-MK attendance. (Catalog: `.claude/skills/knesset-odata/references/api-catalog.md`.)

**Open Knesset presence datasets** — probed 4 plausible paths (`members/mk_individual_presence.csv`, `presence/mk_presence.csv`, `members/presence.csv`, `committees/mk_committee_presence.csv`): all **HTTP 404**. (The nameEn/committee CSVs are already known-404 in `ingest-knesset.ts`.)

**Knesset website API** — probed `MKs/GetMkPresence` (400), `MKs/GetMkActivity` (400), `Presence/GetPresence` (404). No presence endpoint found by guessing. Real discovery (the MK profile page's "ימי נוכחות" backend, if any) is the Phase-A hunt.

**Existing DB (the source we DO have)** — live counts:
- `mk_votes`: **483,939 rows, 148 MKs**. Per-MK example: Ohana(30300) for 1038 / against 2470 / didnt_vote 6, present on **240 distinct vote-days**; Liberman(427) 220 days; Smotrich(30055) only **19 days** (non-MK minister — barely sits).
- `knesset_votes`: **6,986 votes**, 6,901 scoreable, **406 distinct plenum vote-days**, span 2022-11-15→2026-06-10.

## 4. Reused data structures (do NOT redefine)

| Shape | Pointer | Use |
|---|---|---|
| `mkVotes` table (`result` enum incl. `didnt_vote`) | `app/lib/schema-votes.ts:76` | participation source |
| `knessetVotes` (`voteType`,`voteDate`,`isDecisive`) | `app/lib/schema-votes.ts:41` | denominator + day grouping |
| `factionStints` (`personId`,`startDate`,`finishDate`) | `app/lib/schema-votes.ts:151` | tenure window (start→finish; null finish = ongoing) |
| `RecentMkVote` + `getRecentMkVotes` | `app/lib/votes/read-repo.ts:182,191` | sibling pattern to mirror for the new read fn |
| Driver-agnostic `DB` handle | top of `read-repo.ts` | inject PGlite in tests |
| `politicians.inKnessetSince` | `app/lib/schema.ts` | tenure-start fallback when no stint |
| `formatDate`, `pct` | `lib/time.ts`, `lib/format.ts` | display |

**Searched, nothing exists:** no participation/attendance read fn anywhere (`grep getMkParticipation|attendance|presence` → none); no participation columns on `politicians`. New definitions justified.

---

## Phase A — API research + documentation (HARD GATE for attendance)

> Timeboxed (~1–2h). Read-only. Output gates Phase C. Honors "see if we can get from the API" + "document all the API."

### A-1. Hunt for an official attendance source
- [ ] **Step 1: MK profile page backend.** Load an MK page on `main.knesset.gov.il` (e.g. via WebFetch / firecrawl-scrape) and inspect for a "נוכחות"/"ימי נוכחות" section; capture any XHR endpoint it calls (the website API surface). Record exact URL + payload + response shape if found.
- [ ] **Step 2: Open Knesset re-discovery.** Check `production.oknesset.org` dataset index for any presence/attendance pipeline (the historical `mk__presence`/hours-of-presence datasets) — try the datapackage index, not just guessed CSV names.
- [ ] **Step 3: OData committee-session angle.** Confirm (re-probe) whether ANY entity ties a person to a `KNS_CommitteeSession`/`KNS_PlenumSession` attendance row. Expected: no. Document the negative result with the exact query.

### A-2. Document everything found
- [ ] **Step 4:** Append findings to `.claude/skills/knesset-odata/references/api-catalog.md` under a new "Attendance / presence — availability" section: every probe (URL → result), VERIFIED/NOT-FOUND, and the verdict. Add a one-line pointer in the `knesset-odata` SKILL.md if a usable endpoint was found.
- [ ] **Step 5: Decision.** Write the gate outcome at the top of this plan's Phase C:
  - **FOUND** (a usable, attributable, official attendance source) → Phase C = ingest it + show real "ימי נוכחות".
  - **NOT FOUND** → Phase C = ship the **roll-call-presence proxy** from Phase B's data, labelled "השתתפות בהצבעות שמיות" (NOT "ימי נוכחות"), OR defer attendance — **surface this choice to the user** (AskUserQuestion) before building C.

> Per prior research + today's re-probe, NOT FOUND is the likely outcome. Phase B is independent and proceeds regardless.

---

## Phase B — Vote-participation metric (data already in DB)

### B-1. The read function

**Files:** Create `app/lib/votes/participation.ts` (keep `read-repo.ts` under 500 lines); Test: `app/lib/votes/participation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, afterEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { knessetVotes, mkVotes, factionStints } from "@/app/lib/schema";
import { getMkParticipation } from "./participation";

let h: Awaited<ReturnType<typeof createTestDb>>;
const prov = { sourceDataset: "test", sourceUrl: "https://knesset.gov.il/x", fetchedAt: new Date("2026-01-01") };

beforeEach(async () => {
  h = await createTestDb();
  // 3 scoreable votes during MK 100's tenure; he votes in 2 (for, against), misses 1.
  await h.db.insert(knessetVotes).values([
    { voteId: 1, knessetNum: 25, titleHe: "א", voteDate: new Date("2026-02-01T10:00:00Z"), voteType: "roll_call", isDecisive: true, detailsStatus: "complete", ...prov },
    { voteId: 2, knessetNum: 25, titleHe: "ב", voteDate: new Date("2026-02-01T12:00:00Z"), voteType: "roll_call", isDecisive: true, detailsStatus: "complete", ...prov },
    { voteId: 3, knessetNum: 25, titleHe: "ג", voteDate: new Date("2026-02-02T10:00:00Z"), voteType: "roll_call", isDecisive: true, detailsStatus: "complete", ...prov },
    // a vote BEFORE his tenure — must not count against him
    { voteId: 4, knessetNum: 25, titleHe: "ד", voteDate: new Date("2025-01-01T10:00:00Z"), voteType: "roll_call", isDecisive: true, detailsStatus: "complete", ...prov },
  ]);
  await h.db.insert(factionStints).values({
    personToPositionId: 1, personId: 100, factionId: 50, knessetNum: 25,
    startDate: new Date("2026-01-15T00:00:00Z"), finishDate: null, ...prov,
  });
  await h.db.insert(mkVotes).values([
    { voteId: 1, personId: 100, result: "for", factionId: 50, ...prov },
    { voteId: 2, personId: 100, result: "against", factionId: 50, ...prov },
    // vote 3: no row → absent. vote 4: pre-tenure → excluded from denominator.
  ]);
});
afterEach(async () => { await h.close(); });

test("counts votes participated vs missed within the MK's tenure window", async () => {
  const p = await getMkParticipation({ db: h.db, personId: 100 });
  expect(p.votesInTenure).toBe(3);   // votes 1,2,3 (vote 4 pre-tenure excluded)
  expect(p.participated).toBe(2);    // voted in 1 + 2
  expect(p.missed).toBe(1);          // vote 3
  expect(p.presentDays).toBe(1);     // only 2026-02-01 had a row (2 votes same day)
  expect(p.plenumDaysInTenure).toBe(2); // 02-01 and 02-02
});

test("an MK with no attributed votes → zeros, never null/NaN", async () => {
  const p = await getMkParticipation({ db: h.db, personId: 999 });
  expect(p).toEqual({ votesInTenure: 0, participated: 0, missed: 0, presentDays: 0, plenumDaysInTenure: 0 });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm vitest run app/lib/votes/participation.test.ts`
Expected: FAIL — `getMkParticipation is not a function`.

- [ ] **Step 3: Implement**

```ts
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, eq, gte, lte, or, isNull, sql, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { knessetVotes, mkVotes, factionStints } from "@/app/lib/schema";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export interface MkParticipation {
  votesInTenure: number;   // scoreable plenum votes during the MK's tenure
  participated: number;    // of those, votes the MK has a row for (any result, incl. נוכח)
  missed: number;          // votesInTenure − participated (roll-calls with no row in window)
  presentDays: number;     // distinct plenum-vote-days the MK appears in ≥1 roll-call
  plenumDaysInTenure: number; // distinct plenum-vote-days in the tenure window
}

const ZERO: MkParticipation = { votesInTenure: 0, participated: 0, missed: 0, presentDays: 0, plenumDaysInTenure: 0 };

/**
 * An MK's K25 roll-call participation — votes attended vs missed, and the days they
 * showed up — over their OWN tenure window (so departed MKs / non-MK ministers aren't
 * scored against votes that happened when they weren't sitting). Roll-call-presence is a
 * PROXY for attendance, NOT official "ימי נוכחות" — label it accordingly in the UI.
 * Scoreable universe = electronic|roll_call votes (hand/secret have no per-MK rows).
 */
export async function getMkParticipation({
  db = defaultDb, personId,
}: { db?: DB; personId: number }): Promise<MkParticipation> {
  // Tenure window = earliest faction-stint start → latest finish (null = ongoing → now).
  const stints = await db
    .select({ start: factionStints.startDate, finish: factionStints.finishDate })
    .from(factionStints)
    .where(eq(factionStints.personId, personId));
  if (stints.length === 0) return ZERO; // never sat in K25 (e.g. a card with no votes)
  const start = stints.reduce((m, s) => (s.start < m ? s.start : m), stints[0].start);
  const ongoing = stints.some((s) => s.finish == null);
  const finish = ongoing ? null : stints.reduce<Date>((m, s) => (s.finish! > m ? s.finish! : m), stints[0].finish!);

  const scoreable = and(
    inArray(knessetVotes.voteType, ["roll_call", "electronic"] as const),
    gte(knessetVotes.voteDate, start),
    finish ? lte(knessetVotes.voteDate, finish) : sql`true`,
  );

  const [denom] = await db
    .select({
      votes: sql<number>`count(*)::int`,
      days: sql<number>`count(distinct date(${knessetVotes.voteDate}))::int`,
    })
    .from(knessetVotes)
    .where(scoreable);

  const [mine] = await db
    .select({
      participated: sql<number>`count(*)::int`,
      days: sql<number>`count(distinct date(${knessetVotes.voteDate}))::int`,
    })
    .from(mkVotes)
    .innerJoin(knessetVotes, eq(knessetVotes.voteId, mkVotes.voteId))
    .where(and(eq(mkVotes.personId, personId), scoreable));

  const votesInTenure = denom?.votes ?? 0;
  const participated = mine?.participated ?? 0;
  return {
    votesInTenure,
    participated,
    missed: Math.max(0, votesInTenure - participated),
    presentDays: mine?.days ?? 0,
    plenumDaysInTenure: denom?.days ?? 0,
  };
}
```

> Note: `or`/`isNull` are imported for future use only if needed; drop unused imports before commit (lint will flag).

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm vitest run app/lib/votes/participation.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/votes/participation.ts app/lib/votes/participation.test.ts
git commit -m "feat(votes): per-MK roll-call participation (attended vs missed, tenure-scoped)"
```

### B-2. Render on the politician card

**Files:** Modify `app/politician/[id]/page.tsx` (data fetch ~line 36, render above "הצבעות אחרונות" ~line 183)

- [ ] **Step 1: Fetch it alongside the existing reads**

Add `getMkParticipation` to the import from a new path and to the `Promise.all`:

```tsx
import { getMkParticipation } from "@/app/lib/votes/participation";
// ...
  const [activity, recentVotes, participation] = await Promise.all([
    getPoliticianActivity({ personId }),
    getRecentMkVotes({ personId }),
    getMkParticipation({ personId }),
  ]);
```

- [ ] **Step 2: Render the participation block** (above "הצבעות אחרונות"). Only show when there's a denominator; otherwise an explicit empty state — never a fake 0/0:

```tsx
          {participation.votesInTenure > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">השתתפות בהצבעות</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card px-4 py-4 text-center">
                  <p className="nums font-display text-3xl font-black text-primary">
                    <bdi>{participation.participated}</bdi>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    הצבעות מתוך <bdi className="nums">{participation.votesInTenure}</bdi>
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-4 text-center">
                  <p className="nums font-display text-3xl font-black text-primary">
                    <bdi>{participation.presentDays}</bdi>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ימי הצבעה מתוך <bdi className="nums">{participation.plenumDaysInTenure}</bdi>
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                מבוסס על הצבעות שמיות במליאה בתקופת כהונתו · לא כולל הצבעות חשאיות והצבעות בהרמת יד
              </p>
            </section>
          )}
```

> Copy decision (final): label is **"השתתפות בהצבעות"** + the disclaimer line — NOT "ימי נוכחות". This keeps the proxy honest (the sourcing rule). If Phase A finds official attendance, Phase C swaps in a real "ימי נוכחות" block.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "app/politician/[id]/page.tsx"
git commit -m "feat(politician): show roll-call participation (attended/days) on the card"
```

### B-3. Browser QA

- [ ] **Step 1:** Invoke the `browser-qa` skill (quick mode) on :3210. Flows: a high-participation MK (Ohana 30300 → ~3514/… , 240 days), Liberman (427), a non-MK minister (Smotrich 30055 → tiny numbers, tenure-scoped not 0/406), and an MK with zero attributed votes (empty state, no block). Verify RTL + `.nums`/`<bdi>` render correctly and dark mode. Tick findings into `.browser-qa/qa-plan.md`.

---

## Phase C — Attendance days (CONDITIONAL on Phase A gate)

- [ ] **If A = NOT FOUND:** use `AskUserQuestion` to confirm: ship the Phase-B proxy as-is (recommended) **or** add an "official attendance unavailable" note. No ingest. Done.
- [ ] **If A = FOUND:** new sub-plan — ingest the attendance source (script with `assertNonProductionDb()` first; store with provenance triplet; declare any index in-schema), a read fn `getMkAttendance`, and a real "ימי נוכחות: N מתוך M" block replacing the proxy label. This sub-plan is written only after A resolves, citing the FOUND source's exact shape.

---

## Phase D — Finalize

- [ ] **Step 1:** Refresh `.claude/skills/knesset-odata/references/api-catalog.md` if any live shape differed during A; delete unused probe notes.
- [ ] **Step 2:** Run `/wrap-up` if present (advisory gate for `/log-decisions` + `/evergreen-documentation`). If absent: add a `docs/decisions/knesset-data.md` entry recording the attendance-source verdict + the participation-proxy decision (newest-on-top, immutable).
- [ ] **Step 3:** Full gate — `pnpm typecheck && pnpm lint && pnpm test` (vitest) green.
- [ ] **Step 4:** `/code-review` on the diff; address findings; never `--no-verify`.
- [ ] **Step 5:** Push branch, open PR; attach a card before/after via `pr-media`.

---

## Verification status

### Verified — from source / live probe (2026-06-12)
| Item | Citation |
|---|---|
| `mk_votes` has full K25 per-MK rows (483,939 / 148 MKs); absence = no row | live DB probe (§3) |
| Result domain incl. `didnt_vote`/נוכח | `app/lib/votes/normalize.ts:20-21` |
| 6,986 votes / 406 plenum-days / span | live DB probe |
| `faction_stints` gives tenure window | `schema-votes.ts:151` + probe (Smotrich 19 days proves tenure-scoping matters) |
| OData has NO attendance entity | live `$metadata` grep → none |
| `getRecentMkVotes` shape to mirror | `read-repo.ts:182-213` |

### NOT verified — needs Phase-A live work
| Item | Gate | How to verify | Owner |
|---|---|---|---|
| **Official MK attendance source exists** | **HARD GATE — Phase A** | scrape MK profile page backend + Open Knesset index + OData committee-session re-probe | impl |
| `voteType` enum values in prod (`roll_call` vs `electronic`) match the scoreable filter | A/B-1 | the integration test seeds both; spot-check `select distinct "voteType" from knesset_votes` against the filter before B-2 | impl |
| Tenure window correctness for multi-stint switchers | B-1 | integration test seeds 2 stints; spot-check a real party-switcher on prod read | impl |
