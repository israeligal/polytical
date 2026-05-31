import type { CatColor, Politician, PoliticianFact } from "@/lib/types";
import type { PoliticianRow } from "./repo";

// Maps a `politicians` DB row → the existing front-end `Politician` shape,
// WITHOUT changing lib/types or components/caricature-card.tsx. This keeps the
// mock-driven market detail stable while the cards themselves run on real data.

const NO_PARTY = "ללא סיעה";
const DEFAULT_ROLE = "חבר/ת הכנסת";

const CAT_SLOTS = 8;

// Stable, collision-reducing factionId → color-slot assignment. Each distinct
// factionId claims the next free slot (1..8) on first sight, in encounter order,
// and that mapping is remembered for the module's lifetime — so two distinct
// parties never *arbitrarily* share a hue the way `factionId % 8` did (e.g. ids
// 3 and 11 both landed on slot 4). The current Knesset has fewer than 8 active
// factions, so within one render every distinct party gets its own hue.
//
// WRAP: once more than 8 distinct factionIds have been seen, the (1 + n % 8)
// cycle forces reuse — slot 1 is handed out again for the 9th faction, slot 2
// for the 10th, and so on. This is deterministic but no longer collision-free.
// NOTE: full per-party distinctness beyond 8 factions needs a palette expansion
// (more `--cat-*` tokens + CatColor union members) — a future change.
const slotByFaction = new Map<number, CatColor>();

/** factionId → one of the 8 categorical color slots (1..8), stably assigned. */
function catFor(factionId: number | null): CatColor {
  const key = factionId ?? 0;
  const existing = slotByFaction.get(key);
  if (existing !== undefined) return existing;
  const slot = ((slotByFaction.size % CAT_SLOTS) + 1) as CatColor;
  slotByFaction.set(key, slot);
  return slot;
}

/** Year of `inKnessetSince` as a string, or undefined when the date is absent. */
function knessetSinceYear(value: string | null): string | undefined {
  if (!value) return undefined;
  const year = new Date(value).getFullYear();
  return Number.isNaN(year) ? undefined : String(year);
}

export function dbToCard(row: PoliticianRow): Politician {
  const party = row.party?.trim() || NO_PARTY;
  const role = row.roleHe?.trim() || DEFAULT_ROLE;
  const sinceYear = knessetSinceYear(row.inKnessetSince);

  const facts: PoliticianFact[] = [
    { label: "סיעה", value: party },
    { label: "תפקיד", value: role },
    ...(sinceYear ? [{ label: "בכנסת מאז", value: sinceYear }] : []),
  ];

  return {
    id: String(row.personId),
    name: row.nameHe,
    party,
    role,
    cat: catFor(row.factionId),
    tagline: row.roleHe?.trim() ?? "",
    facts,
    imageUrl: undefined,
  };
}
