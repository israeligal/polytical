# Polytical Phase 7 — Community Market Suggestions + Politician Markets

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Deliver the "community" half of the PRD's admin+community markets — logged-in users propose markets, admins review (approve → a real market is created, or reject with a note). Also close the visible loop on the politician page: replace the "שווקים בקרוב" placeholder with the real markets that feature that MK.

**Builds on (do NOT rebuild):** the comments feature is the end-to-end template (Route/Action → Service → Repository → DB, RORO, injectable `db?`/`tx?`, typed errors, Hebrew `{ok,message}` actions). `repo.createMarket` (markets/repo.ts:352) creates market+outcomes+links in one tx — approval reuses it. `bundleToMarket` + `MarketCard` render markets. `getSession`/`isAdmin` gate. `createTestDb` for PGlite tests.

**Key facts from the Understand pass:** `createMarket` is in the REPO, not service, and owns its own `db.transaction` → refactor it to accept an optional `tx?` so approval is atomic. Validation is hand-rolled (NOT Zod). **No app-level rate-limiting exists** (CLAUDE.md mandates it for suggestions) → add a small in-memory limiter. Category union lives in `lib/types.ts`; `CATEGORIES` in `lib/categories.ts`. Column names are camelCase strings; `userId` is `text` (Better Auth id), market/suggestion ids are `uuid`; `personId` is `integer` with NO FK (resolve by stable id).

---

## Task 1: Schema + errors + migration

- [ ] `app/lib/schema.ts`: add
```ts
export const suggestionStatus = pgEnum("suggestion_status", ["pending", "approved", "rejected"]);

export const marketSuggestions = pgTable("market_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  questionHe: text("questionHe").notNull(),
  category: text("category").notNull(),              // Category union, stored as text
  personId: integer("personId"),                      // optional featured MK (→ politicians.personId), no FK
  status: suggestionStatus("status").notNull().default("pending"),
  reviewNote: text("reviewNote"),
  reviewedBy: text("reviewedBy").references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  marketId: uuid("marketId").references(() => markets.id, { onDelete: "set null" }), // set on approve
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}, (t) => [index("market_suggestions_status_idx").on(t.status, t.createdAt)]);
```
- [ ] `app/lib/errors.ts`: add `SuggestionTooShortError`, `SuggestionTooLongError`, `InvalidCategoryError`, `SuggestionNotFoundError`, `AlreadyReviewedError` (one-line house style).
- [ ] `pnpm db:generate` → `0009_*`; `pnpm db:push` to Neon. Commit.

## Task 2: Rate limiter (TDD)

- [ ] `app/lib/rate-limit.ts`: in-memory fixed-window `checkRateLimit({ key, max, windowMs }) → { allowed, retryAfterMs }`. Single-server (matches Better Auth's in-memory note).
- [ ] `app/lib/rate-limit.test.ts`: allows up to `max` in a window, blocks the `max+1`th, resets after the window (drive time by passing a `now` arg, not sleeping).

## Task 3: Suggestions repo + service (TDD)

- [ ] `app/lib/suggestions/repo.ts`: `insertSuggestion`, `listSuggestions({status?})` (join users for proposer name), `listSuggestionsByUser`, `lockSuggestion({tx,id})` (FOR UPDATE, throws `SuggestionNotFoundError`), `markReviewed({tx,id,status,reviewerId,reviewNote?,marketId?})`. Driver-agnostic `DB`/`Tx`.
- [ ] `app/lib/suggestions/service.ts`: `MIN_SUGGESTION_LEN=10`, `MAX_SUGGESTION_LEN=200`. `createSuggestion` (trim → short/long/category/personId validation → insert). `approveSuggestion({suggestionId,reviewerId,closeAt})` in ONE `db.transaction`: lock → assert pending (else `AlreadyReviewedError`) → `createMarket({tx, ... binary כן/לא, personIds})` → `markReviewed(approved, marketId)`. `rejectSuggestion({suggestionId,reviewerId,note})`. `listSuggestions`, `getMySuggestions`.
- [ ] `app/lib/suggestions/service.test.ts` (PGlite): create happy path + too-short + too-long + bad-category; approve creates a real `open` market with כן/לא + the link + flips status, second approve → `AlreadyReviewedError`; reject sets rejected + note; getMySuggestions returns own only.

## Task 4: createMarket tx + getMarketsForPolitician

- [ ] `app/lib/markets/repo.ts`: refactor `createMarket` to `tx ? run(tx) : db.transaction(run)` (add `tx?: Tx`). Add `getMarketsForPolitician({personId})` → 4 queries (links → markets `inArray` desc createdAt → outcomes → all links), returns `{market,outcomes,personIds}[]` (same bundle shape).
- [ ] `app/lib/markets/repo.test.ts`: a market linked to personId 100 is returned with its outcomes + personIds; an unrelated market is excluded; no markets → `[]`.

## Task 5: Server actions

- [ ] `app/actions/suggestions.ts`: `suggestMarketAction` (session gate → rate-limit `suggest:${userId}` 5/10min → createSuggestion → revalidate → map errors Hebrew). `approveSuggestionAction` (admin gate → parse closeAt → approveSuggestion → revalidate /admin,/,layout → map `AlreadyReviewedError`/`SuggestionNotFoundError`). `rejectSuggestionAction` (admin gate).

## Task 6: UI

- [ ] `app/suggest/page.tsx` (RSC, gated → /login?callbackUrl=/suggest) + `components/suggest-market-form.tsx` (client: question textarea w/ counter, category select, optional politician select; pre-fill from `?person=`). Pass `politicians:{personId,name}[]` + `categories` from server.
- [ ] `app/politician/[id]/page.tsx`: replace the placeholder (keep the h2) with a `grid gap-4` of `MarketCard` from `getMarketsForPolitician`; resolve `featured` via a polById map; dashed empty-state when zero; a "הציעו שוק על {name}" link → `/suggest?person={personId}`.
- [ ] `app/admin/page.tsx` + `components/admin/suggestion-review-row.tsx`: a "הצעות מהקהל" section listing pending suggestions; approve (datetime-local closeAt) / reject (note).
- [ ] `app/profile/page.tsx`: "ההצעות שלי" section with status badges (ממתין/אושר/נדחה).
- [ ] `components/site-header.tsx`: add `{ href: "/suggest", label: "הציעו שוק" }` to NAV.

## Task 7: Verify + review + QA

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.
- [ ] Adversarial review workflow (data integrity, atomicity of approve, RSC boundaries, RTL, scope guards, convention compliance) → fix findings.
- [ ] `docs/decisions/suggestions.md` (atomic approve via tx-aware createMarket; rate-limit; binary כן/לא default; resolve-personId rule; deferred: edit/delete, multi-outcome suggestions, notify-on-review).
- [ ] Browser QA: suggest → admin approve → market appears + on the politician page; reject path; rate-limit. Commit + PR.

## Self-Review
- **Money-safety:** approval reuses `createMarket` (no new ledger writes); the only coin path remains `applyEntry` via placeBet/resolve.
- **Atomicity:** approve runs createMarket + markReviewed in ONE tx (createMarket made tx-aware); terminal status guarded under a FOR UPDATE lock (`AlreadyReviewedError`).
- **Reuse:** comments structure, createMarket, bundleToMarket/MarketCard, getSession/isAdmin, createTestDb.
- **Deferred:** author edit/delete, multi-outcome suggestions, notify-proposer-on-review, per-IP limits.
