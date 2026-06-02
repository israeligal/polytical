export class InsufficientFundsError extends Error {
  constructor() {
    super("Insufficient funds");
    this.name = "InsufficientFundsError";
  }
}
export class FaucetCooldownError extends Error {
  constructor(public readonly nextClaimAt: Date) {
    super("Faucet on cooldown");
    this.name = "FaucetCooldownError";
  }
}
export class MissingUserError extends Error {
  constructor() {
    super("Missing userId");
    this.name = "MissingUserError";
  }
}
export class BalanceOverflowError extends Error {
  constructor() {
    super("Balance exceeds maximum");
    this.name = "BalanceOverflowError";
  }
}
export class BelowMinBetError extends Error { constructor() { super("Below minimum bet"); this.name = "BelowMinBetError"; } }
export class MarketNotFoundError extends Error { constructor() { super("Market not found"); this.name = "MarketNotFoundError"; } }
export class MarketClosedError extends Error { constructor() { super("Market is not open"); this.name = "MarketClosedError"; } }
export class InvalidOutcomeError extends Error { constructor() { super("Outcome not in market"); this.name = "InvalidOutcomeError"; } }
export class AlreadyResolvedError extends Error { constructor() { super("Market already resolved/voided"); this.name = "AlreadyResolvedError"; } }
export class NotAdminError extends Error { constructor() { super("Admin only"); this.name = "NotAdminError"; } }
export class EmptyCommentError extends Error { constructor() { super("Comment is empty"); this.name = "EmptyCommentError"; } }
export class CommentTooLongError extends Error { constructor() { super("Comment too long"); this.name = "CommentTooLongError"; } }
export class CommentNotFoundError extends Error { constructor() { super("Comment not found"); this.name = "CommentNotFoundError"; } }
export class SuggestionTooShortError extends Error { constructor() { super("Suggestion too short"); this.name = "SuggestionTooShortError"; } }
export class SuggestionTooLongError extends Error { constructor() { super("Suggestion too long"); this.name = "SuggestionTooLongError"; } }
export class InvalidCategoryError extends Error { constructor() { super("Invalid category"); this.name = "InvalidCategoryError"; } }
export class SuggestionNotFoundError extends Error { constructor() { super("Suggestion not found"); this.name = "SuggestionNotFoundError"; } }
export class AlreadyReviewedError extends Error { constructor() { super("Suggestion already reviewed"); this.name = "AlreadyReviewedError"; } }
export class UnknownPoliticianError extends Error { constructor() { super("Politician not found"); this.name = "UnknownPoliticianError"; } }
export class ClosePastError extends Error { constructor() { super("Close date must be in the future"); this.name = "ClosePastError"; } }
export class NotificationNotFoundError extends Error { constructor() { super("Notification not found"); this.name = "NotificationNotFoundError"; } }
// --- Onboarding + card collection (Phase 2) ---
export class InvalidHandleError extends Error { constructor() { super("Handle must be 3–20 chars: a–z, 0–9, _"); this.name = "InvalidHandleError"; } }
export class HandleTakenError extends Error { constructor() { super("Handle already taken"); this.name = "HandleTakenError"; } }
export class InvalidArenaError extends Error { constructor() { super("Invalid arena"); this.name = "InvalidArenaError"; } }
export class HandleRequiredError extends Error { constructor() { super("Handle must be set before onboarding completes"); this.name = "HandleRequiredError"; } }
export class AlreadyOnboardedError extends Error { constructor() { super("User already onboarded"); this.name = "AlreadyOnboardedError"; } }
export class AlreadyOwnedError extends Error { constructor() { super("Card already collected"); this.name = "AlreadyOwnedError"; } }
// --- Seasons (Phase 3) ---
export class SeasonEndedError extends Error { constructor() { super("Season has ended"); this.name = "SeasonEndedError"; } }
export class AlreadyClaimedError extends Error { constructor() { super("Tier already claimed"); this.name = "AlreadyClaimedError"; } }
export class TierNotReachedError extends Error { constructor() { super("Tier goal not reached"); this.name = "TierNotReachedError"; } }
export class TierNotFoundError extends Error { constructor() { super("Tier not found"); this.name = "TierNotFoundError"; } }
export class NoActiveSeasonError extends Error { constructor() { super("No active season"); this.name = "NoActiveSeasonError"; } }
export class AnotherSeasonActiveError extends Error { constructor() { super("Another season is already active"); this.name = "AnotherSeasonActiveError"; } }
export class SeasonNotFoundError extends Error { constructor() { super("Season not found"); this.name = "SeasonNotFoundError"; } }
export class InvalidSeasonError extends Error { constructor() { super("Invalid season definition"); this.name = "InvalidSeasonError"; } }
