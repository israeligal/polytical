# MK Vote-Participation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Show, per MK, how engaged they were in the K25 plenum — **how many roll-call votes they participated in vs missed, and on how many plenum days they showed up** — from data we already hold, labelled honestly. Also document the (now-settled) attendance-source findings so the research is preserved.

**Research status: COMPLETE.** No research steps remain (see §3 for verified findings). The literal "days present out of days the plenum sat" is **not buildable** — confirmed three independent ways — so per the user's decision (2026-06-12) we ship **vote-participation only** (from `mk_votes`), no external ingest.

**Architecture:** Zero new API. Compute on-read in a new `app/lib/votes/participation.ts` (mirroring `getRecentMkVotes`), tenure-scoped via `faction_stints`, rendered in the politician page's record section. Plus a docs-only task recording the attendance-API findings.

**Tech Stack:** TypeScript, Drizzle, PGlite (`createTestDb`) + Vitest, Next 16 RSC, Tailwind v4 (logical props, OKLCH, `.nums`/`<bdi>`), Hebrew RTL.

**Worktree:** `/Users/gal/personal-projects/polytical-attendance` (branch `feat/mk-participation`, off `origin/main`) — already created. All work happens here.

---

## 1. Files read (verified 2026-06-12)
- `app/lib/votes/read-repo.ts` — `getRecentMkVotes`/`RecentMkVote` (pattern to mirror), driver-agnostic `DB` handle.
- `app/lib/votes/normalize.ts:20` — `WEBSITE_RESULT_BY_ID` (`6=didnt_vote/נוכח 7=for 8=against 9=abstain`).
- `app/lib/schema-votes.ts` — `mkVotes` (PK `(voteId,personId)`, `result` enum, `mk_votes_person_idx`), `knessetVotes` (`voteType`,`voteDate`,`isDecisive`), `factionStints` (`personId`,`startDate`,`finishDate`).
- `app/politician/[id]/page.tsx` — data fetch (~line 36 `Promise.all`), "הצבעות אחרונות" render (~line 183).
- `.claude/skills/knesset-odata/{SKILL.md,references/api-catalog.md}`, `docs/decisions/knesset-data.md` (docs targets).
- `app/lib/testing/create-test-db.ts`, `app/lib/votes/pipeline.integration.test.ts` (PGlite harness).

## 2. Convention compliance (root `CLAUDE.md`)
- Route→Service→Repository: read in `app/lib/votes/participation.ts`; page calls it, never `db`.
- Resolve by stable id (`personId`); never Hebrew string.
- Errors over fallbacks / absent fact = explicit "not found": no denominator → no block, never a fake 0/0.
- RORO + exported result interface; no inline types.
- Tokens/OKLCH, logical props, `.nums`/`<bdi>` for the "N מתוך M" run; dates via `lib/time.ts`.
- PGlite integration test, real Drizzle, no internal mocks.
- File < 500 lines: new `participation.ts` keeps `read-repo.ts` from growing.

## 3. Verified findings (research done — cited, not to be re-run)
- **Vote participation IS derivable from our DB.** `mk_votes` = 483,939 rows / 148 MKs; `knesset_votes` = 6,986 votes / 406 plenum vote-days (2022-11-15→2026-06-10). Present = MK has a row; **missed = no row** for a scoreable vote in the MK's tenure window. Ohana(30300) 240 vote-days; Smotrich(30055) 19 (proves tenure-scoping is required).
- **Plenum physical attendance is NOT available** (3 independent agents): OData has no person↔session link (all 38 entities checked — `KNS_PlenumSession`/`KNS_CommitteeSession` carry no PersonID); the Knesset website API has no presence endpoint (exhaustive 404/empty-204 probing); the official `presence/` page is HTTP 500 / JS-only SPA; Open Knesset `members/presence/presence.csv` is **0 bytes** (broken) and its raw log stops **2024-02-18**.
- **Committee attendance exists but is out of scope** (user chose participation-only): Open Knesset `people/committees/meeting-attendees/kns_committeesession.csv` (`attended_mk_individual_ids`, live, K25) — NLP-parsed/incomplete, committee-only, 160MB. Documented for the record, not ingested.

## 4. Reused data structures (do NOT redefine)
| Shape | Pointer |
|---|---|
| `mkVotes` (`result` incl. `didnt_vote`) | `app/lib/schema-votes.ts` |
| `knessetVotes` (`voteType`,`voteDate`) | `app/lib/schema-votes.ts` |
| `factionStints` (`startDate`,`finishDate`) | `app/lib/schema-votes.ts` |
| `getRecentMkVotes`/`RecentMkVote` (mirror) | `app/lib/votes/read-repo.ts:182` |
| `formatDate`/`pct` | `lib/time.ts`, `lib/format.ts` |

Searched — nothing exists: no participation/attendance read fn (`grep getMkParticipation|attendance|presence` → none); no participation columns on `politicians`. New definitions justified.

---

## Task 1: `getMkParticipation` read fn (data already in DB)

**Files:** Create `app/lib/votes/participation.ts`; Test `app/lib/votes/participation.test.ts`

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
  await h.db.insert(knessetVotes).values([
    { voteId: 1, knessetNum: 25, titleHe: "א", voteDate: new Date("2026-02-01T10:00:00Z"), voteType: "roll_call", isDecisive: true, detailsStatus: "complete", ...prov },
    { voteId: 2, knessetNum: 25, titleHe: "ב", voteDate: new Date("2026-02-01T12:00:00Z"), voteType: "roll_call", isDecisive: true, detailsStatus: "complete", ...prov },
    { voteId: 3, knessetNum: 25, titleHe: "ג", voteDate: new Date("2026-02-02T10:00:00Z"), voteType: "roll_call", isDecisive: true, detailsStatus: "complete", ...prov },
    { voteId: 4, knessetNum: 25, titleHe: "ד", voteDate: new Date("2025-01-01T10:00:00Z"), voteType: "roll_call", isDecisive: true, detailsStatus: "complete", ...prov }, // pre-tenure
  ]);
  await h.db.insert(factionStints).values({
    personToPositionId: 1, personId: 100, factionId: 50, knessetNum: 25,
    startDate: new Date("2026-01-15T00:00:00Z"), finishDate: null, ...prov,
  });
  await h.db.insert(mkVotes).values([
    { voteId: 1, personId: 100, result: "for", factionId: 50, ...prov },
    { voteId: 2, personId: 100, result: "against", factionId: 50, ...prov },
  ]); // vote 3 = absent; vote 4 = pre-tenure (excluded)
});
afterEach(async () => { await h.close(); });

test("counts votes participated vs missed within the MK's tenure window", async () => {
  const p = await getMkParticipation({ db: h.db, personId: 100 });
  expect(p.votesInTenure).toBe(3);
  expect(p.participated).toBe(2);
  expect(p.missed).toBe(1);
  expect(p.presentDays).toBe(1);          // only 2026-02-01 had a row
  expect(p.plenumDaysInTenure).toBe(2);   // 02-01 + 02-02
});

test("an MK with no faction stint → all zeros, never null/NaN", async () => {
  const p = await getMkParticipation({ db: h.db, personId: 999 });
  expect(p).toEqual({ votesInTenure: 0, participated: 0, missed: 0, presentDays: 0, plenumDaysInTenure: 0 });
});
```

- [ ] **Step 2: Run → fails** — `pnpm vitest run app/lib/votes/participation.test.ts` (FAIL: not a function).

- [ ] **Step 3: Implement** (`app/lib/votes/participation.ts`)

```ts
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { knessetVotes, mkVotes, factionStints } from "@/app/lib/schema";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export interface MkParticipation {
  votesInTenure: number;
  participated: number;
  missed: number;
  presentDays: number;
  plenumDaysInTenure: number;
}

const ZERO: MkParticipation = { votesInTenure: 0, participated: 0, missed: 0, presentDays: 0, plenumDaysInTenure: 0 };

/**
 * An MK's K25 roll-call participation — votes attended vs missed, plus the plenum days
 * they appeared on — over their OWN tenure window (so departed MKs / non-MK ministers
 * aren't scored against votes cast when they weren't sitting). Roll-call presence is a
 * PROXY, NOT official "ימי נוכחות" — the UI labels it "השתתפות בהצבעות". Scoreable
 * universe = electronic|roll_call (hand/secret votes carry no per-MK rows).
 */
export async function getMkParticipation({
  db = defaultDb, personId,
}: { db?: DB; personId: number }): Promise<MkParticipation> {
  const stints = await db
    .select({ start: factionStints.startDate, finish: factionStints.finishDate })
    .from(factionStints)
    .where(eq(factionStints.personId, personId));
  if (stints.length === 0) return ZERO;
  const start = stints.reduce((m, s) => (s.start < m ? s.start : m), stints[0].start);
  const ongoing = stints.some((s) => s.finish == null);
  const finish = ongoing ? null : stints.reduce<Date>((m, s) => (s.finish! > m ? s.finish! : m), stints[0].finish!);

  const scoreable = and(
    inArray(knessetVotes.voteType, ["roll_call", "electronic"]),
    gte(knessetVotes.voteDate, start),
    ...(finish ? [lte(knessetVotes.voteDate, finish)] : []),
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

- [ ] **Step 4: Run → passes** — `pnpm vitest run app/lib/votes/participation.test.ts` (2 pass). Then `pnpm typecheck`.

- [ ] **Step 5: Commit** — `git add app/lib/votes/participation.ts app/lib/votes/participation.test.ts && git commit -m "feat(votes): per-MK roll-call participation (attended vs missed, tenure-scoped)"`

> **Pre-impl sanity (do once, before Step 3):** `select distinct "voteType" from knesset_votes` against prod (`.env`) — confirm the live enum values are exactly `roll_call`/`electronic`/`hand`/`secret` so the `inArray` filter matches. If a value differs, fix the filter list before proceeding.

## Task 2: Render on the politician card

**Files:** Modify `app/politician/[id]/page.tsx`

- [ ] **Step 1: Fetch alongside existing reads** — add to the import + `Promise.all`:
```tsx
import { getMkParticipation } from "@/app/lib/votes/participation";
// ...
  const [activity, recentVotes, participation] = await Promise.all([
    getPoliticianActivity({ personId }),
    getRecentMkVotes({ personId }),
    getMkParticipation({ personId }),
  ]);
```

- [ ] **Step 2: Render block** above "הצבעות אחרונות" — only when there's a denominator (else nothing; never a fake 0):
```tsx
          {participation.votesInTenure > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">השתתפות בהצבעות</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card px-4 py-4 text-center">
                  <p className="nums font-display text-3xl font-black text-primary"><bdi>{participation.participated}</bdi></p>
                  <p className="mt-1 text-sm text-muted-foreground">הצבעות מתוך <bdi className="nums">{participation.votesInTenure}</bdi></p>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-4 text-center">
                  <p className="nums font-display text-3xl font-black text-primary"><bdi>{participation.presentDays}</bdi></p>
                  <p className="mt-1 text-sm text-muted-foreground">ימי הצבעה מתוך <bdi className="nums">{participation.plenumDaysInTenure}</bdi></p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">מבוסס על הצבעות שמיות במליאה בתקופת כהונתו · לא כולל הצבעות חשאיות והצבעות בהרמת יד</p>
            </section>
          )}
```
> Final copy: **"השתתפות בהצבעות"** + the disclaimer — NOT "ימי נוכחות" (it's a roll-call proxy; sourcing rule).

- [ ] **Step 3: `pnpm typecheck && pnpm lint`** → clean.
- [ ] **Step 4: Commit** — `git commit -m "feat(politician): show roll-call participation on the card"`

## Task 3: Document the verified attendance-API findings (so research isn't lost)

**Files:** `.claude/skills/knesset-odata/references/api-catalog.md` (append section), `docs/decisions/knesset-data.md` (prepend entry)

- [ ] **Step 1:** Append to `api-catalog.md` an "Attendance / presence — availability (verified 2026-06-12)" section: OData has no per-MK attendance entity; Knesset website API has no presence endpoint (probed, all 404/empty-204); official `presence/` page HTTP 500 / SPA; Open Knesset `members/presence` CSV 0-bytes/stale (raw log ends 2024-02-18); Open Knesset `people/committees/meeting-attendees/kns_committeesession.csv` has `attended_mk_individual_ids` (live, K25, committee-only, NLP-parsed) — the only usable presence source, deferred. Each line marked VERIFIED/NOT-FOUND.
- [ ] **Step 2:** Prepend a `docs/decisions/knesset-data.md` entry (newest-on-top, immutable): "Plenum attendance not available; ship vote-participation proxy from `mk_votes`; committee-attendance via Open Knesset deferred (caveated)."
- [ ] **Step 3: Commit** — `git commit -m "docs(knesset): attendance-source findings + participation decision"`

## Task 4: Verify + QA + review + PR
- [ ] **Step 1:** Full gate — `pnpm typecheck && pnpm lint && pnpm test` (vitest) green.
- [ ] **Step 2:** `browser-qa` (quick) on :3210 — Ohana(30300, high), Liberman(427), Smotrich(30055, tenure-scoped small), an MK with no votes (block absent). RTL + `.nums`/`<bdi>` + dark mode. Spot-check Ohana's numbers against the DB.
- [ ] **Step 3:** Run `/wrap-up` if present (advisory; else the Task-3 decision entry covers it).
- [ ] **Step 4:** `/code-review` on the diff; fix findings; never `--no-verify`.
- [ ] **Step 5:** Push `feat/mk-participation`, open PR; attach a card screenshot via `pr-media`.

---

## Verification status
### Verified (source / live probe 2026-06-12)
| Item | How |
|---|---|
| Participation derivable from `mk_votes` (483,939/148); absence = no row | live DB probe |
| `faction_stints` gives tenure window (Smotrich 19 days proves scoping) | live probe |
| Plenum attendance unavailable (OData/website/OpenKnesset all dead/stale) | 3 parallel research agents |
| `getRecentMkVotes` shape to mirror | `read-repo.ts:182` |

### NOT verified — confirm during build (not blockers)
| Item | How |
|---|---|
| Live `voteType` enum values match the `inArray` filter | Task-1 pre-impl `select distinct "voteType"` against prod |
| Multi-stint tenure window for a real party-switcher | Task-1 test seeds 2 stints; spot-check on prod read in Task-4 QA |
