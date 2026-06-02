// Hebrew-aware normalization for the trigram DISCOVERY column ONLY.
// Mirrors unaccent(lower(...)) + niqqud strip + final-form fold + leading
// particle strip. Never used for attribution/market resolution.

const NIQQUD = /[֑-ׇ]/g;                 // cantillation + vowel points (U+0591–U+05C7)
// Hebrew geresh (U+05F3), gershayim (U+05F4), and ASCII/typographic apostrophe &
// quote — these sit INSIDE a token (e.g. ג׳בארין, צ'רלי) marking a sound, not a
// boundary. Delete them in place (don't space-split) so the token stays whole.
const INTRA_TOKEN_MARKS = /[׳״'"’“”]/g;
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
 * Strips a CHAIN of leading particles down to the stem, peeling one particle at
 * a time while the remaining stem stays a plausible word (>= 4 chars). This
 * collapses stacked clitics like the definite-article + preposition: both
 * "הבחירות" (ה+ב+חירות) and "בחירות" (ב+חירות) reduce to the same "חירות", so a
 * query typed WITH the definite article still matches the indexed stem. (The old
 * single-strip version left "הבחירות" untouched when the 2nd char was also a
 * particle, silently breaking those searches.) Short surnames like שלום / מלר
 * keep their first letter. Idempotent: it loops to a fixpoint (a fully-stripped
 * stem has no leading particle), so re-normalizing is a no-op.
 * (Distinguishing a particle ה from a root-initial ה is lexical and undecidable
 * without a dictionary; this is a deliberately aggressive discovery-only
 * heuristic applied identically to the query AND the index — attribution always
 * uses the stable id.)
 */
function stripLeadingParticle(tok: string): string {
  let t = tok;
  // Peel while: long enough that the stem stays >= 4 chars, and the head is a particle.
  while (t.length >= 5 && LEADING_PARTICLES.has(t[0])) {
    t = t.slice(1);
  }
  return foldFinals(t); // re-fold a now-exposed final letter
}

export function normalizeSearchName(input: string): string {
  if (!input) return "";
  let s = foldFinals(input.normalize("NFKD").replace(NIQQUD, "").toLowerCase());
  // Delete intra-token marks IN PLACE before the punctuation->space strip, so
  // ג׳בארין collapses to one token (ג בארינ would be wrong).
  s = s.replace(INTRA_TOKEN_MARKS, "");
  s = s
    .split(/[\s\-_/]+/)
    .filter(Boolean)
    .map(stripLeadingParticle)
    .join(" ");
  // drop residual punctuation, collapse whitespace
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return s;
}
