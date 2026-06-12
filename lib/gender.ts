/**
 * Gendered Hebrew-copy helpers.
 *
 * Each function takes `{ gender }` and returns the correct Hebrew string for
 * the given gender, or the established neutral/slash form when gender is null
 * (unknown). The null fallback MUST be exactly the string already in
 * production — callers that pass null see ZERO copy change.
 */

export type Gender = "male" | "female" | null;

/**
 * The MK title line.
 *   male   → "חבר הכנסת"
 *   female → "חברת הכנסת"
 *   null   → "חבר/ת הכנסת"   ← today's neutral form (unchanged)
 */
export function mkTitle({ gender }: { gender: Gender }): string {
  if (gender === "male") return "חבר הכנסת";
  if (gender === "female") return "חברת הכנסת";
  return "חבר/ת הכנסת";
}

/**
 * "שהוא/היא מופיע/ה בהן" — the phrase in the card-unlock progress blurb:
 *   "צדקו N פעמים בתחזיות [appearsIn] כדי לאסוף את הקלף"
 *
 *   male   → "שהוא מופיע בהן"
 *   female → "שהיא מופיעה בהן"
 *   null   → "שהוא מופיע בהן"   ← today's copy (unchanged)
 */
export function appearsIn({ gender }: { gender: Gender }): string {
  if (gender === "female") return "שהיא מופיעה בהן";
  return "שהוא מופיע בהן";
}

/**
 * "הצביע/ה" — voted (past tense, used in vote-column headers):
 *   male   → "הצביע"
 *   female → "הצביעה"
 *   null   → "הצביע/ה"   ← today's copy (unchanged)
 */
export function voted({ gender }: { gender: Gender }): string {
  if (gender === "male") return "הצביע";
  if (gender === "female") return "הצביעה";
  return "הצביע/ה";
}
