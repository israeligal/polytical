import type { Rarity, Suit } from "@/components/icons";

// Presentation-only collectible treatment for politician cards (the design's
// rarity frames). There is no card-collection economy in the backend — rarity +
// suit are DERIVED from the MK's role/category purely for the visual frame.

/** Stable rarity from role: the more senior the seat, the rarer the card. */
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

export const RARITY_HE: Record<Rarity, string> = {
  common: "רגיל",
  rare: "נדיר",
  epic: "אפי",
  legendary: "אגדי",
};

// Cards unlock by ACCURACY: how many correct predictions on markets featuring a
// politician are needed to collect their card. Scales with the card's rarity —
// the more senior the seat, the more correct calls it takes (PM/ministers 10,
// chairs/deputies 7, regular slots 5, plain MKs 2).
export const RARITY_UNLOCK_THRESHOLD: Record<Rarity, number> = {
  legendary: 10,
  epic: 7,
  rare: 5,
  common: 2,
};

/** Correct predictions needed to unlock a politician's card, from their role. */
export function unlockThresholdForRole(role: string | undefined | null): number {
  return RARITY_UNLOCK_THRESHOLD[rarityForRole(role)];
}

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
