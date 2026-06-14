import type { CatColor, Politician, PoliticianFact } from "@/lib/types";
import type { Gender } from "@/lib/gender";
import { mkTitle } from "@/lib/gender";
import type { PoliticianRow } from "./repo";

// Maps a `politicians` DB row → the existing front-end `Politician` shape,
// WITHOUT changing lib/types or components/caricature-card.tsx. This keeps the
// mock-driven market detail stable while the cards themselves run on real data.



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
  const hasParty = !!row.party?.trim();
  const party = hasParty ? row.party!.trim() : ""; // empty (no faction) — NOT "ללא סיעה"
  const gender = (row.gender ?? null) as Gender;
  // roleHe from OData may be empty/null for a rank-and-file MK — fall back to
  // the gendered MK title ("חבר הכנסת" / "חברת הכנסת" / "חבר/ת הכנסת") so the
  // card shows the correct form rather than a generic slash.
  const role = row.roleHe?.trim() || mkTitle({ gender });
  const sinceYear = knessetSinceYear(row.inKnessetSince);
  const isNorwegianMinister =
    (row.facts as { isNorwegianMinister?: boolean })?.isNorwegianMinister === true;

  const facts: PoliticianFact[] = [
    ...(hasParty ? [{ label: "סיעה", value: party }] : []),
    { label: "תפקיד", value: role },
    // "בסיעה מאז" only makes sense alongside a current faction — omit it for
    // partyless cards (Norwegian-law ministers, departed MKs) even if a past
    // stint gives a year.
    ...(hasParty && sinceYear ? [{ label: "בסיעה מאז", value: sinceYear }] : []),
  ];

  return {
    id: String(row.personId),
    name: row.nameHe,
    party,
    role,
    cat: catFor(row.factionId),
    tagline: row.roleHe?.trim() ?? "",
    facts,
    imageUrl: row.imageUrl ?? undefined,
    isNorwegianMinister,
    gender: gender ?? undefined,
  };
}
