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
