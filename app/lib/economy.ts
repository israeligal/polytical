export const STARTING_STACK = 1000;
export const DAILY_FAUCET = 200;
export const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MIN_BET = 10;
/** Hard cap so a credit can never exceed int4 range (2^31−1); controlled error, not a raw PG range crash. */
export const MAX_BALANCE = 1_000_000_000;

// --- Daily streak (Phase 6) ---
/** Claim again within this window of the last claim and the streak continues; otherwise it resets to 1. */
export const STREAK_GRACE_MS = 48 * 60 * 60 * 1000;
/** Coins added to the faucet per streak day beyond the first. */
export const STREAK_BONUS_PER_DAY = 25;
/** Streak bonus caps after this many days (day 8+ → +175). */
export const STREAK_BONUS_DAYS = 7;

/** The faucet payout for a given streak length (day 1 = base, scaling + capped). */
export function faucetAmountForStreak(streak: number): number {
  const bonusDays = Math.min(Math.max(streak - 1, 0), STREAK_BONUS_DAYS);
  return DAILY_FAUCET + bonusDays * STREAK_BONUS_PER_DAY;
}
