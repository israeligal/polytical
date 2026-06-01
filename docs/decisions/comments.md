# Decision Log — Comments (per-market hot takes)

> Newest on top. Entries are immutable historical records: supersede, don't edit.
> See the full plan: `docs/superpowers/plans/2026-06-01-comments.md`.

---

## 2026-06-01 — Per-market discussion: post, upvote-toggle, admin-hide

Phase 4 replaces the dashed `התגובות ייפתחו עם ההשקה` placeholder on the market
page with a real, lightweight discussion thread — the PRD's third chosen hook
("Comments & hot takes"). Logged-in users post; any logged-in user upvotes
(toggle, no double-vote); admins hide. **Comments touch NO coins** — nothing here
imports the ledger; `comments`/`comment_votes` are an independent slice of the
schema with their own additive migration (`0007`).

### Upvote = a toggle backed by `comment_votes`, never a raw counter bump

The naive design — an "upvote" button that does `upvotes = upvotes + 1` — lets one
user inflate a comment indefinitely. Instead each vote is a **row** in
`comment_votes` keyed by `PRIMARY KEY (commentId, userId)`, so a given user can hold
**at most one** vote on a comment; the database enforces it. `comments.upvotes` is a
**cached count** of those rows, kept in step inside the same transaction as the row
change. `repo.toggleUpvote` runs one tx:

- vote row exists → `DELETE` it **and** `upvotes = upvotes − 1` → `{ upvoted: false }`
- no vote row → `INSERT` it **and** `upvotes = upvotes + 1` → `{ upvoted: true }`

Because the check-then-mutate is in a single `db.transaction`, the cached count can
never drift from the row count, and clicking upvote twice lands back at the original
count (1 → 0). Two different users on the same comment → 2. The read path
(`listComments`) recomputes `mineUpvoted` per viewer with an `EXISTS` subquery against
`comment_votes` rather than trusting any client state, and orders `upvotes desc,
createdAt desc` (hot first, then recent). Hidden rows are excluded at the query
(`hidden = false`), not in app code.

### 500-char cap, trimmed, enforced in the service — empty is a domain error

`postComment` **trims** then validates: length 0 → `EmptyCommentError`
(`"אי אפשר להגיב ריק"`), length > `MAX_COMMENT_LEN` (500) → `CommentTooLongError`
(`"התגובה ארוכה מדי (עד 500 תווים)"`). Validation lives in the **service**, not just
the textarea's `maxLength` — the client counter is UX, the server is the authority.
Whitespace-only bodies trim to empty and are rejected. There is **no market-status
check**: comments are allowed on any market (draft → open → resolved), because a
post-mortem discussion on a settled market is desirable, not a bug.

### Moderation is admin-hide (soft), gated at the action layer

A comment is never hard-deleted by moderation; `hideComment` flips `hidden = true`
and the row simply drops out of `listComments` (`hidden = false` filter). This keeps
an audit trail and is reversible. Authorization is enforced in the **server action**,
not merely the UI: `hideCommentAction` re-reads the session and bails with
`"להנהלה בלבד"` unless `session.user.isAdmin`, mirroring the Phase-2 rule that admin
checks are authoritative at the action layer (the "הסתר" button is only *rendered*
for admins, but a non-admin invoking the action directly is still refused). Posting
and upvoting likewise require a session (`"התחברו כדי להגיב"` / `"…להצביע"`); the
thread shows a login link to logged-out viewers instead of the form.

### Same driver-agnostic typing as markets/ledger — PGlite tests + postgres-js

The repo and service type their injectable `db` as the same
`PgDatabase<PgQueryResultHKT, typeof schema, …>` handle (and reuse `LedgerTx` for the
tx-aware mutators) used across `app/lib/markets/*` and `app/lib/ledger/*`. One code
path type-checks and runs on **both** production postgres-js/Neon and the in-memory
**PGlite** test database with no `as any`. Mutators are tx-aware (`tx?: LedgerTx`) so
they can compose; `toggleUpvote` opens its **own** tx so the row-check + count-bump
stay atomic. Tests (PGlite) cover: post inserts + appears in `getComments`;
empty/whitespace → `EmptyCommentError`; 501 chars → `CommentTooLongError`; hidden
excluded; toggle twice by one user → 1 then 0 (one vote row max); two users → 2;
ordering by upvotes then recency.

### What the comments loop does end-to-end now

Market page (`app/market/[id]/page.tsx`) reuses the session it already loads for the
bet panel → `<CommentThread marketId viewerId isAdmin>` (Server Component) →
`getComments({ marketId, viewerId })` renders the count, the `<CommentForm>` (or a
login link), and the `<CommentRow>` list (empty state `היו הראשונים להגיב`). The form
(client) posts via `postCommentAction` through `useTransition`, clearing on success
and surfacing the error message on failure. Each row (client) shows author initial +
name + time + body, an upvote pill (filled when `mineUpvoted`, optimistic count) →
`upvoteCommentAction`, and an admin-only `הסתר` → `hideCommentAction`. Every action
`revalidatePath('/market/${marketId}')`. Migration `0007` (additive
`comments`/`comment_votes`, FK-cascading off `markets`/`user`, `comments_market_idx`
on `(marketId, createdAt)`, composite vote PK) was applied to **live Neon** via
`pnpm db:push` and verified present (both tables, all columns, the composite PK, and
the index).

### Deferred (correct for Phase 4)

- **Threaded replies.** Flat thread only — no `parentId`, no nesting. A reply tree
  needs recursive rendering + a different ordering story; out of scope here.
- **Report → review queue.** No user-facing "report" button or moderation inbox.
  Moderation today is admins manually hiding via the inline `הסתר` button. A report
  queue (flag → admin triage) is a later phase.
- **Per-user rate limiting.** No app-level throttle on posting/voting; we rely on
  Better Auth's endpoint limits (and the `comment_votes` PK, which already caps a
  user to one vote per comment) for now. A real "N comments / minute" limiter is
  deferred.
- **Author edit / delete.** A user cannot edit or delete their own comment yet; only
  admins can hide. Author-side editing/deleting comes later.

**Verified:** `pnpm db:push` (0007 applied to live Neon, tables confirmed),
`pnpm lint`, `pnpm typecheck`, `pnpm test` (75 passed — incl. the comments suite:
post/empty/too-long/hidden/toggle-idempotency/two-user/ordering), `pnpm build`
(the `/market/[id]` route compiles) — all green. Live browser QA of the
post → upvote → hide loop runs in the closing `qa-session`.
</content>
</invoke>
