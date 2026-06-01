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
