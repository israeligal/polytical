# Decisions — market removal flow

## 2026-06-10 — Review-driven hardening (same session)

- **Delete notices carry `refMarketId: null`** so the in-app link falls back to
  /profile and the push URL to /notifications — a deep link to the deleted
  market would 404. (`market_voided` event's marketId widened to `string | null`.)
- **Deleting an already-voided market notifies nobody** — its predictors were
  already notified at void time; re-emitting would double-notify.
- **`repo.deleteMarket` carries the status guard in SQL** (`status != 'resolved'`),
  matching markResolved/markVoided's DB-layer terminal-invariant convention.
- **`listManageableMarkets` now includes voided markets** so the delete-voided
  cleanup path is actually reachable from the admin UI (prod ops are UI-only).
- **`createMarketAction` lost its `type` param** — binary is hardcoded, not
  validated; the retired capability is unrepresentable instead of rejected.
- **Predict/comment on a just-deleted market returns a friendly "השוק הוסר"**
  instead of an unhandled server error (MarketNotFoundError / FK 23503).

## 2026-06-10 — Hard-delete flow, resolved-market guard, binary-only

- **Admin delete is a hard delete, not a soft hide.** `deleteMarket` removes the
  market row; FK cascades (already in the schema) wipe outcomes, predictions and
  comments. Rationale: an invalid market (e.g. "האם יוכרזו בחירות עד סוף 2026?"
  after the dissolution bill passed first reading) should leave no trace in the
  feed, search, or politician pages — void keeps a "השוק בוטל" tombstone, which
  is the wrong UX for an editorially-bad question.
- **Resolved markets cannot be deleted** (`AlreadyResolvedError`). Their outcome
  already bumped `users.totalResolved/totalWins` and card progress; deleting the
  market would orphan those stats with no rollback. Void/delete must happen
  before resolution.
- **Delete notifies predictors via the existing `market_voided` event** ("השוק
  בוטל · התחזית שלך בוטלה"). Accurate copy for the user, and avoids a
  `notification_type` pgEnum migration. Notification rows survive the delete by
  design (ref columns carry no FK — schema comment at notifications table).
- **Yes/no is the only market type going forward.** The create form no longer
  offers multi; `createMarketAction` rejects `type !== "binary"` and requires
  exactly two outcome labels. The `marketType` enum and multi rendering stay for
  legacy rows until they're removed from prod.
- **Prod data ops go through the deployed admin UI, never scripts** — the only
  database is production (no dev DB), and `assertNonProductionDb()` does not
  recognize the Neon host as prod.
