# app/lib/agenda — "על סדר היום" pre-voting feed

Bills approaching their decisive 2nd-3rd reading vote, where a user states a stance **in advance** (עמדה מראש) that's adopted into the real vote on resolution. Feed at `/agenda`; the בעד/נגד widget lives on the bill page. Sibling stance domain: `app/lib/agenda-stances/`. Decisions: `docs/decisions/knesset-data.md`.

## Files

- `read-repo.ts` — `getAgendaFeed` → `AgendaFeedItem[]` (status, expectedDate, k-anon counts, **initiators** + `initiatorCount`, **splitParent**); `getAnnouncedAgendaItemByBill` (drives the bill-page widget).
- `curate.ts` — ingest sweep: ensure every bill in an eligible status (`ELIGIBLE_STATUS_IDS`) has an `announced` item; drop items that left the window. Idempotent; never touches voted/dropped or admin-added rows.
- `resolve.ts` — ingest sweep (keystone): when an item's bill gets its decisive vote, link it and ADOPT every pre-vote stance into `user_stances` (then the match engine sees them like any stance). Atomic per item, idempotent.
- `*.test.ts` — PGlite integration.

Sibling `app/lib/agenda-stances/`: `repo.ts` (toggle/aggregate, k-gated, cascade-delete) + `service.ts` (`setAgendaStance` announced-only guard, `AGENDA_AGGREGATE_MIN_STANCERS`). Page `app/agenda/page.tsx`; UI `components/{agenda-card,hero(AgendaHeroSpotlight),agenda-stance-widget,bill-lineage}.tsx`. Curation+resolution run in `scripts/ingest-knesset.ts` (`--full`).

## Invariants

- **Pre-vote ≠ scoreable.** A stance counts only after `resolve.ts` adopts it into `user_stances` — no match-unlock counter in agenda-stances (unlike `user_stances`).
- **Initiators = `billSponsors.isInitiator`** (full politician rows via `dbToCard` → portraits), ordinal order, capped at `MAX_INITIATORS_PER_ITEM`; `initiatorCount` is the true total for the "+N" chip.
- **Direction never leaves the DB**: `agendaStances` aggregates are k-gated in the service; rows cascade-delete with the account.
- **Stable-id joins only**; community split withheld below `AGENDA_AGGREGATE_MIN_STANCERS` (the page nulls `forPct`).

## Gotchas

- **~73/75 announced items are split budget bills** (`SubTypeDesc = ממשלתית`) with **0 own initiators** — by design (the parent holds them). So most cards show NO portrait but DO show `splitParent` ("חלק מ:"). Don't read missing portraits as an ingest gap.
- `getAgendaFeed` joins the split parent via `alias(bills, "parent_bill")` (separate query → a Map, never a row-multiplying join). `BillLineage` uses `asLink={false}` on cards (the card is already a `<Link>`).
