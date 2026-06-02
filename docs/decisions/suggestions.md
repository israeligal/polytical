# Decision log — Community market suggestions (Phase 7)

## Approval is atomic: createMarket made tx-aware
Approving a suggestion must (a) create a real market and (b) flip the suggestion to `approved` linked to that market — together or not at all. `repo.createMarket` previously owned its own `db.transaction`, so nesting it in the approval flow wasn't possible. Refactored `createMarket` to accept an optional `tx?`: standalone callers (admin/seed) still open their own transaction; `approveSuggestion` passes its tx so the market insert + outcomes + politician links + the status flip all commit in ONE transaction. A rollback leaves nothing (proven by a repo test). This keeps the project's "one authoritative writer, atomic" rule even for a non-coin table.

## Terminal-state guard under a FOR UPDATE lock
`approveSuggestion`/`rejectSuggestion` lock the suggestion row (`SELECT … FOR UPDATE`) FIRST, then assert `status === "pending"` (else `AlreadyReviewedError`). Two admins acting on the same suggestion concurrently serialize on the lock — no duplicate market, no double-review. Mirrors the ledger's faucet/grant lock-first pattern.

## Approved suggestions go live immediately (status `open`)
`createMarket` doesn't set a status, so the schema default (`open`) applies — an approved suggestion becomes a live market right away, not a draft. The admin supplies the `closeAt` at approval time. Deferred: a draft/preview step before going live.

## Binary כן/לא by default
Every approved suggestion becomes a binary yes/no market. Users propose a *question*, not outcomes — keeping the public form simple and the parimutuel math unambiguous. Multi-outcome community suggestions are deferred (admins can still create multi markets directly).

## Featured politician resolved by stable id, never guessed
The optional featured MK is validated in the service via `getPoliticianByPersonId` — a non-existent `personId` throws `UnknownPoliticianError` rather than being silently dropped (the project's "resolve by stable id, absent → explicit error, never fuzzy" trust rule). The public form only offers real MKs; the server re-validates because actions can be POSTed directly.

## App-level rate limiting added (new mechanism)
Better Auth's limiter only covers its own `/api/auth` endpoints — it cannot see a Server Action. Added `app/lib/rate-limit.ts`, an in-memory fixed-window limiter (same single-server scope as Better Auth's store), and applied it to `suggestMarketAction` (5 proposals / 10 min / user). This fills the CLAUDE.md mandate to rate-limit suggestions. The limiter is generic and reusable (comments/bets can adopt it next).

## Politician → markets surfacing
`getMarketsForPolitician({ personId })` returns the same `{ market, outcomes, personIds }` bundles the homepage uses (4 bulk queries, no N+1). The politician page's "שווקים בקרוב" placeholder is replaced with real `MarketCard`s; when an MK has no markets, a dashed empty state invites proposing one (`/suggest?person=<id>`).

## Deferred
- Author edit/delete of a pending suggestion.
- Multi-outcome community suggestions.
- Notify the proposer when their suggestion is reviewed (in-app/email).
- Per-IP rate limiting (current limiter is per authenticated user).
- Retrofitting the rate limiter onto comments/bets (left as a fast follow).
