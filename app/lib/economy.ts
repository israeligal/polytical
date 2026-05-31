export const STARTING_STACK = 1000;
export const DAILY_FAUCET = 200;
export const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MIN_BET = 10;
/** Hard cap so a credit can never exceed int4 range (2^31−1); controlled error, not a raw PG range crash. */
export const MAX_BALANCE = 1_000_000_000;
