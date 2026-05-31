// Hebrew-aware normalization for the trigram DISCOVERY column ONLY.
// Mirrors unaccent(lower(...)) + niqqud strip + final-form fold + leading
// particle strip. Never used for attribution/market resolution.

const NIQQUD = /[֑-ׇ]/g;                 // cantillation + vowel points (U+0591–U+05C7)
const FINAL_FORMS: Record<string, string> = {
  "ך": "כ", // ך -> כ
  "ם": "מ", // ם -> מ
  "ן": "נ", // ן -> נ
  "ף": "פ", // ף -> פ
  "ץ": "צ", // ץ -> צ
};
const LEADING_PARTICLES = new Set(["ו", "ה", "ב", "ל", "כ", "מ", "ש"]); // ו ה ב ל כ מ ש

function foldFinals(s: string): string {
  return Array.from(s).map((ch) => FINAL_FORMS[ch] ?? ch).join("");
}

/**
 * Strips a SINGLE leading particle from one token, but only when:
 *  - the token is long enough (>= 5) that the stem stays a plausible >= 4-char
 *    word (so short surnames like שלום / מלר keep their first letter), AND
 *  - the next char is itself NOT a particle.
 * The second guard keeps the function IDEMPOTENT: a stripped remainder never
 * again begins with a strippable particle, so re-normalizing is a no-op.
 * (Distinguishing "ה as definite article" from "ה as root-initial" is lexical
 * and undecidable without a dictionary; this is a deliberately conservative
 * discovery-only heuristic — attribution always uses the stable id.)
 */
function stripLeadingParticle(tok: string): string {
  if (tok.length >= 5 && LEADING_PARTICLES.has(tok[0]) && !LEADING_PARTICLES.has(tok[1])) {
    return foldFinals(tok.slice(1)); // re-fold a now-exposed final letter
  }
  return tok;
}

export function normalizeSearchName(input: string): string {
  if (!input) return "";
  let s = foldFinals(input.normalize("NFKD").replace(NIQQUD, "").toLowerCase());
  s = s
    .split(/[\s\-_/]+/)
    .filter(Boolean)
    .map(stripLeadingParticle)
    .join(" ");
  // drop residual punctuation, collapse whitespace
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return s;
}
