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
