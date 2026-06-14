# Plan — Pre-voting / agenda-stances (P0)

> Implementation plan for the spec `docs/superpowers/specs/2026-06-14-pre-voting-agenda-stances-spec.md`.
> **TDD throughout** (test-first, watch-fail, minimal-green). Layered: Route → Service → Repository → DB.

## Worktree & branch
- **Already set up.** Session is in worktree `.claude/worktrees/agenda-stances` on branch `feat/agenda-stances`, based off `feat/bill-pages` (it carries the `bills.statusId` / `/bill/[id]` deps not yet on `main`).
- **Dependency gate: RESOLVED (2026-06-14).** PR #80 merged to `main` (squash `a432c55`); this branch is rebased onto current `origin/main`. `main` advanced to migration `0028_bill_details`, so the new migration is **`0029_agenda_stances`** (not 0025). Commit early/often.
- **Re-validated against current main (2026-06-14):** stances/match/stance-widget UNCHANGED since the plan was written (citations hold). The votes domain advanced (#77 enrich, #79 itemTypeId) but `agenda_items` is still written ONLY by admin CRUD (`votes/repo.ts:341/354`) — my curation/resolution sweeps remain unclaimed. Crucially, `knesset_votes.billId` is now reliably populated from the header signal (`billId = itemTypeId===2 ? itemId : null`, see `app/lib/votes/CLAUDE.md`), so the resolution query `WHERE billId=? AND isDecisive=true` is more robust than before.
- Subagents run in the repo root, not this worktree — implement **inline** in the worktree (TDD), do isolation-sensitive steps (migration, prod apply) inline too.
- **Respect `app/lib/votes/CLAUDE.md`** (votes-domain conventions) and keep it fresh if I add ingest steps.

## Files to read/touch (verified this session)

**Read (patterns to mirror):**
- `app/lib/stances/{service.ts,repo.ts,service.test.ts}` — stance toggle, k-anon aggregate, test harness template.
- `app/lib/match/service.ts:80-136` — confirms adopted `user_stances` rows are picked up with **no** engine change.
- `app/actions/stances.ts` + `app/actions/types.ts:3` — action wrapper (`getSession`+`checkRateLimit`+`ActionResult`).
- `scripts/ingest-knesset.ts:92-98,186-230,261-298` — step registration, `ingestBills`/`ingestBillStatuses`/`ingestLifetimeBills`, prov pattern.
- `app/lib/knesset/{repo.ts:93-165,normalize.ts:7,271-335}` — upsert + normalize house style.
- `app/lib/votes/{repo.ts:235-262 (recomputeDecisive),read-repo.ts:242-316}`, `app/lib/votes/normalize.ts:154-166 (pickDecisiveVoteId)`.
- `app/lib/bills/repo.ts:61-66` — the decisive-vote-for-a-bill query to mirror in resolution.
- `components/stance-widget.tsx`, `app/vote/[id]/page.tsx:73-86`, `app/bill/[billId]/page.tsx`, `app/votes/page.tsx`, `components/site-header.tsx:12-18`, `components/mobile-menu.tsx`, `components/skeletons/{containers.ts,bill-skeleton.tsx,skeletons.stories.tsx,votes-skeletons.tsx}`.

**Create:**
- `app/lib/agenda-stances/{repo.ts,repo.test.ts,service.ts,service.test.ts}`
- `app/actions/agenda-stances.ts`
- `app/lib/agenda/read-repo.ts` (or extend `votes/read-repo.ts`) + test
- `app/agenda/{page.tsx,loading.tsx}`
- `components/agenda-stance-widget.tsx`, `components/skeletons/agenda-skeleton.tsx`
- `drizzle/0029_agenda_stances.sql` (+ journal), `scripts/apply-agenda-migration.ts` (guarded prod applier)

**Modify:**
- `app/lib/schema-votes.ts` (add `agendaStances` + `agendaItems` billId partial-unique index)
- `app/lib/knesset/{normalize.ts,repo.ts}` (curation normalize + upsert), `scripts/ingest-knesset.ts` (two new steps)
- `app/lib/errors.ts` (new error classes), `app/lib/votes/repo.ts` or new resolution writer
- `app/bill/[billId]/page.tsx` (inject widget), `components/site-header.tsx` (nav), `components/skeletons/{containers.ts,skeletons.stories.tsx}`

## Reused data structures (do NOT redefine)
| Shape | Pointer | Use |
|---|---|---|
| `userStance` pgEnum (for/against) | `schema-votes.ts:31` | `agendaStances.stance` reuses it |
| `StanceValue` type | `stances/repo.ts:21` | widget + service input |
| `ActionResult` | `actions/types.ts:3` | action return base |
| `StanceState` shape | `stances/service.ts:28-34` | model `AgendaStanceState` on it |
| `AGGREGATE_MIN_STANCERS = 10` | `stances/service.ts:23` | reuse for k-anon (import/re-export, don't redefine) |
| `AppDb`/`DB`/`Tx` | `db-utils.ts:15`, `db.ts:44,52` | repo/tx types |
| `chunk`/`BATCH`/`sqlExcluded` | `db-utils.ts:27-33` | batched upserts |
| `requireUserId` + error classes | `errors.ts:47-54` | repo guard + new errors here |
| `checkRateLimit` | `rate-limit.ts:16-37` | action rate-limit |
| `logger` | `logger.ts:1-8` | structured ingest logs |
| `agendaItems` table + `AgendaItemRow` | `schema-votes.ts:194-207`, `read-repo.ts:16` | curation/resolution/feed |
| `Prov` interface | `normalize.ts:7` | normalize signature |
| `getAnnouncedAgendaItems` | `read-repo.ts:290-301` (admin writes: `votes/repo.ts:341,354`) | extend for the feed |
| decisive-vote query | `bills/repo.ts:61-66` | mirror in resolution |
| `StanceWidget` | `components/stance-widget.tsx` | mirror as `AgendaStanceWidget` |
| `BILL_CONTAINER` + container convention | `containers.ts:25` | add `AGENDA_CONTAINER` |
| `NAV` | `site-header.tsx:12-18` | add `על סדר היום` entry |

Searched `app/lib`, `app/actions`, `components`, schema files — **no existing** agenda-stance table, service, or widget. New definitions go in the canonical per-domain locations above.

## Verified third-party signatures
- **Drizzle `db.transaction(async (tx) => …)`** — used at `app/lib/votes/repo.ts:161,279`, `app/lib/markets/service.ts:45+`. Canonical atomic pattern for the resolution sweep.
- **Drizzle `.onConflictDoNothing()`** — used at `app/lib/cards/repo.ts`, `app/lib/votes/repo.ts` (confirmed available in this version). For adoption insert.
- **Drizzle `.onConflictDoUpdate({ target, set })`** — `app/lib/knesset/repo.ts:93-114`. For curation upsert (target = `agendaItems.billId` partial-unique).
- **Drizzle `$inferSelect`/`$inferInsert`** — `read-repo.ts:16`, `stances/service.test.ts`. For fixture builders + row types.
- No external HTTP API changes (OData ingest already in place; curation reads `bills` we already store).

## Fixtures
- **Harness:** `createTestDb()` from `@/app/lib/testing/create-test-db` (PGlite, replays `drizzle/*.sql` via `migrate()`). The new `0029` migration must exist before tests run so the test DB has `agenda_stances` (schema + test DDL in lockstep — CLAUDE.md).
- **Seeds** (mirror `stances/service.test.ts` `$inferInsert` helpers): `users`, `bills` (with `statusId` in/out of {113,130,114}), `agendaItems`, `knessetVotes` (with `isDecisive`), `mkVotes` (for the match-visibility assertion). No external payload fixtures needed — OData normalize shapes are already covered by existing `knesset/normalize` tests.

## Build steps (TDD order, bottom-up)

**1. Schema + migration (foundation).**
- Add `agendaStances` pgTable to `schema-votes.ts` (mirror `userStances`): `userId` text cascade→users, `agendaItemId` uuid cascade→agendaItems.id, `stance` (userStance enum), `createdAt`/`updatedAt`; `primaryKey(userId, agendaItemId)`; `index` on `agendaItemId`.
- Add **partial unique index** on `agendaItems.billId WHERE billId IS NOT NULL` (enables idempotent curation `onConflictDoUpdate({ target: agendaItems.billId })`). Declare **in-schema** (db:push drops migration-only indexes).
- Generate `0029_agenda_stances.sql` via `drizzle-kit` (CI shell → `push` needs no TTY, but for a tracked migration generate the SQL; apply to prod later via guarded applier). Update `_journal.json` (idx 29).
- Verify `createTestDb()` migrates clean (first repo test will exercise this).

**2. `agenda-stances/repo.ts` — TDD.** Write `repo.test.ts` first (toggle sets→flips→retracts on `(userId, agendaItemId)`; `getAgendaStanceCounts` GROUP BY stance). Watch fail. Implement `toggleAgendaStance` (DELETE-same-then-`insert().onConflictDoUpdate`), `getAgendaStance`, `getAgendaStancesForItems`, `getAgendaStanceCounts` — `requireUserId` guard first line of each user-scoped fn.

**3. `agenda-stances/service.ts` — TDD.** Test first: guard rejects `voted`/`dropped` items (new `AgendaItemNotFoundError` / `AgendaItemNotStanceableError` in `errors.ts`); toggle delegates to repo; `getAgendaStanceState` returns k-gated aggregate (reuse `AGGREGATE_MIN_STANCERS`). Implement minimal.

**4. `app/actions/agenda-stances.ts`.** Mirror `stances.ts`: `getSession` → 401 message; `checkRateLimit({ key: \`agenda-stance:${userId}\`, max: 40, windowMs: 60_000 })`; call service; catch the new errors; `revalidatePath('/agenda')` + the bill path; `ActionResult`-shaped union. (Thin wrapper; covered by service tests + browser smoke — matches repo convention where actions aren't unit-tested.)

**5. Curation sweep — TDD.** `ELIGIBLE_STATUS_IDS = [113,130,114] as const`. Unit-test pure `normalizeAgendaCuration({ bills, prov })` → AgendaItemRow[] (status `announced`, addedBy `ingest`, billId, titleHe=bill.nameHe). Then integration-test `runAgendaCuration`: creates one row per eligible CURRENT_KNESSET bill (idempotent on rerun via billId conflict), sets `dropped` for ingest items whose bill left the window and is not `voted`, leaves `addedBy='admin'` rows untouched. Register step `agendaCuration` in `ingest-knesset.ts` (`--full` order, after `bills`).

**6. Resolution sweep — TDD (keystone).** Integration tests first: announced item w/ billId whose bill has a decisive vote → in one `db.transaction`, set `linkedVoteId`+`status='voted'` and adopt `agenda_stances`→`user_stances` (read rows, `insert(userStances).values(...).onConflictDoNothing()`); idempotent on rerun; atomic (failure leaves `announced`, no partial user_stances); **adopted rows visible to `computeMatch`**; no decisive vote → stays `announced`; multiple decisive rows for a billId → pick latest by `voteDate` (mirror `bills/repo.ts:61-66`). Register step `agendaResolution` after votes/bills.

**7. Feed read — TDD.** `getAgendaFeed` (extend `getAnnouncedAgendaItems`): announced items + joined bill status desc + per-item for/against counts; sorted `expectedDate asc nulls last, createdAt desc`. Test ordering + shape.

**8. `AgendaStanceWidget` + bill-page injection.** New `'use client'` `components/agenda-stance-widget.tsx` mirroring `stance-widget.tsx` but prop `agendaItemId`, calling `setAgendaStanceAction`; renders בעד/נגד pills + k-gated split; replaces the match-unlock progress line with "תיספר כעמדה כשתתקיים ההצבעה". Inject into `app/bill/[billId]/page.tsx` after the linkedVote section: if an `announced` agenda item exists for this bill, fetch its stance state server-side and render the widget (anon → sign-in prompt). After `voted`, the existing linkedVote section + `/vote/[id]` link covers the reveal.

**9. `/agenda` feed page + nav + skeleton.** `app/agenda/page.tsx` (RSC): `getAgendaFeed` + `getSession` + user's agenda-stances; rows link to `/bill/[billId]`, k-gated split, Hebrew copy, Asia/Jerusalem dates, logical props. `app/agenda/loading.tsx` → `AgendaSkeleton` (role=status, aria-busy, `AGENDA_CONTAINER` added to `containers.ts`) + story in `skeletons.stories.tsx`. Add `{ href: "/agenda", label: "על סדר היום" }` to `NAV` (`site-header.tsx`; mobile menu consumes the same `NAV`).

**10. Analytics.** `track()` on stance set/remove + feed view; structured `logger.info` on resolution adoption (counts adopted per item).

**11. Prod migration apply (HARD GATE — after PR #80 merge + rebase).** Regenerate migration number if it collides on rebase. Apply `0029` to prod via a guarded additive-only applier (mirror `scripts/apply-bill-migration.ts`) — `assertNonProductionDb` does NOT catch the Neon host (memory), so the applier is additive-only + idempotent (skip "already exists"). New table + index only → safe.

**12. Final steps (in order).**
- Refresh/delete any captured fixtures that differed during implementation (none expected).
- `pnpm lint` + typecheck — fix all before stopping.
- Decision log: `docs/decisions/agenda-stances.md` (newest-on-top) — record the merge-into-matching model + status-window choice.
- Run `/wrap-up` (advisory gate → `/log-decisions` / `/evergreen-documentation` incl. refreshing the `knesset-votes` skill if stance vocabulary changed).
- Run `/code-review` before pushing; never `--no-verify`.

## Convention Compliance (CLAUDE.md)
- **Layered** (route→service→repo→db), repo owns DB, `requireUserId` first line — steps 2-4. ✓
- **Errors over fallbacks** — new error classes, throw on missing/invalid item; no silent default. ✓
- **RORO** on every exported fn; **no inline types/Zod** — reuse `StanceValue`/`ActionResult`/`StanceState`; literal-union `ELIGIBLE_STATUS_IDS`. ✓
- **No `as any`**; **no bare console** in server code — use `logger`. ✓
- **RSC-first**; widget is the only `'use client'`; mutations via server action, not `useEffect`. ✓
- **OKLCH tokens + logical props + Hebrew + Asia/Jerusalem** — steps 8-9 reuse existing tokens/`positive`/`negative`. ✓
- **loading.tsx + named skeleton sharing containers** — step 9. ✓
- **Neon/Drizzle**: shared `db` only; declare indexes in-schema; batch ~100; `assertNonProductionDb` first line of the ingest steps; guarded prod apply. ✓
- **Testing**: PGlite real tx, no internal-service mocks, co-located `*.test.ts`, UTC dates, schema+test-DDL+fixtures in lockstep. ✓
- **Process**: worktree + commit early; decision log; lint/typecheck before stop; `/code-review` before push. ✓

## Verification Status

**Verified from source / data (this session):**
| Item | Citation |
|---|---|
| One decisive vote per bill (pick latest by voteDate) | `bills/repo.ts:61-66`; `votes/repo.ts:235-262`; `votes/normalize.ts:154-166` |
| Adopted user_stances visible to match w/ no engine change | `match/service.ts:80-136` |
| Drizzle tx + onConflictDoNothing/Update available | `votes/repo.ts:161,279`; `cards/repo.ts`; `knesset/repo.ts:93-114` |
| Test harness (PGlite createTestDb) | `stances/service.test.ts:1-30`; `@/app/lib/testing/create-test-db` |
| Eligible statuses present in prod (~183 bills) | queried prod K25 status distribution this session (113/130/114) |
| Migration journal at idx 28 (0028_bill_details on main) → new is 0029 | `drizzle/meta/_journal.json` |

**NOT verified — needs live testing:**
| Item | How to verify | Owner |
|---|---|---|
| **Prod migration apply (HARD GATE)** | After #80 merge+rebase, run guarded applier against prod, confirm `agenda_stances` + index exist | me, inline |
| OData exposes a scheduled plenum date for `expectedDate` | Inspect KNS status/agenda payload; if absent, leave null + sort by createdAt (non-blocking) | me |
| Browser smoke: widget on `/bill/[id]` + `/agenda` feed render w/ real prod data | Dev server :3210, sign in (dogfood acct), set/flip/retract a stance, view feed | me |
| Rate-limit threshold (40/60s) fits pre-vote cadence | Reuse stance limit; revisit if needed | me |
