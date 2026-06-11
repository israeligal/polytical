// Outcome-count bounds for multi (single-pick, many-candidate) markets. The cap
// matches the 8 categorical color slots (CatColor 1–8 / outcomes.cat); below 3
// a market is just a binary and should be created as one.
export const MULTI_MIN_OUTCOMES = 3;
export const MULTI_MAX_OUTCOMES = 8;
