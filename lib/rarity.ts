import type { Rarity, Suit } from "@/components/icons";

// Presentation-only collectible treatment for politician cards (the design's
// rarity frames). There is no card-collection economy in the backend — rarity +
// suit are DERIVED purely for the visual frame.
//
// Rarity is a POLITICAL-STATURE metal ladder (see
// docs/specs/2026-06-09-card-rarity-stature-spec.md):
//   legendary = GOLD   — the SITTING Prime Minister (exactly one)
//   epic      = SILVER  — a FORMER PM who actually served
//   rare      = BRONZE  — held/holds a "great office" (senior minister, Knesset
//                         Speaker, opposition leader, major party leader)
//   common    = BASE    — rank-and-file MK
// Precedence (highest wins): sitting-PM → served-as-PM → great-office → MK.
// Truth rule (CLAUDE.md): tier is OFFICE-held, sourced by stable personId, never
// editorialized and never fuzzy-matched; an absent fact yields the base tier.

/**
 * Former PMs who ACTUALLY served (incl. caretaker), keyed by Knesset personId.
 * Only actual service earns Silver — an "Alternate PM" who never rotated in does
 * not (that's Bronze). Source: gov.il PMO list of Prime Ministers of Israel.
 */
const FORMER_PM_PERSON_IDS = new Set<number>([
  23594, // Yair Lapid — caretaker/alternate PM who served Jul–Dec 2022
]);

/**
 * "Great office" holders whose CURRENT Knesset role string doesn't reveal it
 * (e.g. party leaders / former senior ministers now in opposition). Curated by
 * stable personId. Source: Knesset factions list + gov.il ministerial records.
 */
const GREAT_OFFICE_PERSON_IDS = new Set<number>([
  30657, // Benny Gantz — National Unity leader, ex-Defense Minister, Alternate PM
  427, // Avigdor Lieberman — Yisrael Beiteinu leader, ex-Defense/Finance Minister
  30811, // Itamar Ben Gvir — Otzma Yehudit leader, Minister of National Security
]);

/** The SITTING PM (not deputy / acting / alternate). */
function isSittingPmRole(role: string): boolean {
  if (/סגן|ממלא|חליפי/.test(role)) return false; // deputy / acting / alternate
  return /ראש הממשלה/.test(role);
}

/** A current "great office" detectable from the role string alone. */
function isGreatOfficeRole(role: string): boolean {
  return /^שר|\bשר\b|שרה|יושב.?ראש הכנסת|יו״ר הכנסת|ראש האופוזיציה/.test(role);
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
  if (isSittingPmRole(r)) return "legendary"; // GOLD
  if (FORMER_PM_PERSON_IDS.has(personId)) return "epic"; // SILVER
  if (isGreatOfficeRole(r) || GREAT_OFFICE_PERSON_IDS.has(personId)) return "rare"; // BRONZE
  return "common"; // BASE
}

/**
 * @deprecated Role-keyword rarity over-inflates (every minister → legendary).
 * Use {@link statureTierForPolitician}. Retained only until all call sites move.
 */
export function rarityForRole(role: string | undefined | null): Rarity {
  const r = role ?? "";
  if (/ראש הממשלה|^שר|\bשר\b|שרה|יושב.?ראש הכנסת|יו״ר הכנסת/.test(r)) return "legendary";
  if (/יו.?ר|סגן|סגנית/.test(r)) return "epic";
  if (/חבר|חברת/.test(r)) return "common"; // a plain MK
  return "rare";
}

/** Derive a faction "suit" from the categorical color slot (1–8), cyclically. */
export function suitForCat(cat: number): Suit {
  const suits: Suit[] = ["knesset", "ballot", "podium", "mandate"];
  return suits[(Math.max(1, cat) - 1) % 4];
}

// Metal-ladder labels (the tier IS the metal): base · bronze · silver · gold.
export const RARITY_HE: Record<Rarity, string> = {
  common: "רגיל",
  rare: "ארד",
  epic: "כסף",
  legendary: "זהב",
};

/** Tailwind text/border color class per tier (tokens defined in globals.css). */
export const RARITY_TEXT: Record<Rarity, string> = {
  common: "text-rarity-common",
  rare: "text-rarity-rare",
  epic: "text-rarity-epic",
  legendary: "text-rarity-legendary",
};
export const RARITY_BORDER: Record<Rarity, string> = {
  common: "border-rarity-common",
  rare: "border-rarity-rare",
  epic: "border-rarity-epic",
  legendary: "border-rarity-legendary",
};
