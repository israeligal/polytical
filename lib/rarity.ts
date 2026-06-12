import type { Rarity, Suit } from "@/components/icons";

// Presentation-only collectible treatment for politician cards (the design's
// rarity frames). There is no card-collection economy in the backend — rarity +
// suit are DERIVED purely for the visual frame.
//
// Rarity is a POLITICAL-STATURE ladder (see
// docs/specs/2026-06-09-card-rarity-stature-spec.md):
//   legendary = GOLD     — the SITTING Prime Minister (exactly one)
//   epic      = SILVER   — a FORMER PM who actually served
//   rare      = BRONZE   — a PARTY LEADER (head of a faction)
//   uncommon  = SAPPHIRE — a government MINISTER (or Knesset Speaker), not above
//   common    = BASE     — rank-and-file MK
// Precedence (highest wins): sitting-PM → served-as-PM → party-leader → minister → MK.
// Truth rule (CLAUDE.md): tier is OFFICE-held, sourced by stable personId, never
// editorialized and never fuzzy-matched; an absent fact yields the base tier.

/**
 * Former PMs who ACTUALLY served (incl. caretaker), keyed by Knesset personId.
 * Only actual service earns Silver — an "Alternate PM" who never rotated in does
 * not. Source: gov.il PMO list of Prime Ministers of Israel.
 */
const FORMER_PM_PERSON_IDS = new Set<number>([
  23594, // Yair Lapid — caretaker/alternate PM who served Jul–Dec 2022
  23511, // Naftali Bennett — PM Jun 2021–Jul 2022 (not a sitting MK; row is inactive)
]);

/**
 * PARTY LEADERS (heads of a faction), by stable personId. NOTE: the Knesset role
 * "יו״ר סיעה" is the parliamentary whip, NOT the party leader — so leadership is
 * curated here. The roster now includes Norwegian-Law ministers (active without
 * a seat), so leaders who resigned their seats (Smotrich, Sa'ar) are listed too.
 * Source: Knesset factions list (25th Knesset) + party records.
 */
export const PARTY_LEADER_PERSON_IDS = new Set<number>([
  965, // Netanyahu — Likud (also sitting PM → gold by precedence)
  23594, // Lapid — Yesh Atid (also former PM → silver by precedence)
  30657, // Benny Gantz — National Unity
  427, // Avigdor Lieberman — Yisrael Beiteinu
  30811, // Itamar Ben Gvir — Otzma Yehudit
  2291, // Aryeh Deri — Shas
  526, // Moshe Gafni — United Torah Judaism (Degel HaTorah)
  30066, // Ayman Odeh — Hadash
  560, // Ahmad Tibi — Ta'al
  30713, // Mansour Abbas — Ra'am
  30814, // Avi Maoz — Noam
  30055, // Bezalel Smotrich — Religious Zionism (Norwegian-Law minister)
  1027, // Gideon Sa'ar — New Hope (Norwegian-Law minister)
  30846, // Yitzhak Goldknopf — UTJ/Agudat Yisrael (returned to his seat 2025-06)
]);

/** The SITTING PM (not deputy / acting / alternate). */
function isSittingPmRole(role: string): boolean {
  if (/סגן|ממלא|חליפי/.test(role)) return false; // deputy / acting / alternate
  return /ראש הממשלה/.test(role);
}

/** A serving government minister or Knesset Speaker (NOT a deputy). */
function isMinisterRole(role: string): boolean {
  // Exclude deputies — both masculine "סגן" (final nun ן) and feminine/plural
  // "סגנית"/"סגני" (regular nun נ). `/סגן/` alone misses "סגנית".
  if (/סג[ןנ]/.test(role)) return false; // deputy minister / deputy speaker
  return /^שר|\bשר\b|שרה|יושב.?ראש הכנסת|יו״ר הכנסת/.test(role);
}

/**
 * Stature-based rarity. Pass the stable `personId` and the MK's role string.
 * @example statureTierForPolitician({ personId: 965, role: "ראש הממשלה" }) // "legendary"
 */
export function statureTierForPolitician({
  personId,
  role,
}: {
  personId: number;
  role: string | undefined | null;
}): Rarity {
  const r = role ?? "";
  if (isSittingPmRole(r)) return "legendary"; // GOLD — sitting PM
  if (FORMER_PM_PERSON_IDS.has(personId)) return "epic"; // SILVER — former PM
  if (PARTY_LEADER_PERSON_IDS.has(personId)) return "rare"; // BRONZE — party leader
  if (isMinisterRole(r)) return "uncommon"; // SAPPHIRE — minister / Speaker
  return "common"; // BASE — rank-and-file MK
}

/** Derive a faction "suit" from the categorical color slot (1–8), cyclically. */
export function suitForCat(cat: number): Suit {
  const suits: Suit[] = ["knesset", "ballot", "podium", "mandate"];
  return suits[(Math.max(1, cat) - 1) % 4];
}

// Stature-ladder labels: base · sapphire (minister) · bronze · silver · gold.
export const RARITY_HE: Record<Rarity, string> = {
  common: "רגיל",
  uncommon: "ספיר",
  rare: "ארד",
  epic: "כסף",
  legendary: "זהב",
};

// Cards unlock by ACCURACY: how many correct predictions on markets featuring a
// politician are needed to collect their card. Scales with the card's STATURE
// tier (the more senior the office, the more correct calls it takes), mapping the
// product spec exactly: PM (gold) 10 · former-PM (silver) 7 · party-leader
// (bronze) 5 · minister (sapphire) 3 · rank-and-file MK (base) 2.
export const RARITY_UNLOCK_THRESHOLD: Record<Rarity, number> = {
  legendary: 10,
  epic: 7,
  rare: 5,
  uncommon: 3,
  common: 2,
};

/** Correct predictions needed to unlock a politician's card. Keyed off the
 *  stable personId + role so the stature tier (party leaders / former PMs are
 *  identified by personId) is resolved the same way the card frame is. */
export function unlockThreshold({
  personId,
  role,
}: {
  personId: number;
  role: string | undefined | null;
}): number {
  return RARITY_UNLOCK_THRESHOLD[statureTierForPolitician({ personId, role })];
}

/** Tailwind text/border color class per tier (tokens defined in globals.css). */
export const RARITY_TEXT: Record<Rarity, string> = {
  common: "text-rarity-common",
  uncommon: "text-rarity-uncommon",
  rare: "text-rarity-rare",
  epic: "text-rarity-epic",
  legendary: "text-rarity-legendary",
};
export const RARITY_BORDER: Record<Rarity, string> = {
  common: "border-rarity-common",
  uncommon: "border-rarity-uncommon",
  rare: "border-rarity-rare",
  epic: "border-rarity-epic",
  legendary: "border-rarity-legendary",
};
