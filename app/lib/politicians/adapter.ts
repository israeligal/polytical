import type { CatColor, Politician, PoliticianFact } from "@/lib/types";
import type { PoliticianRow } from "./repo";

// Maps a `politicians` DB row → the existing front-end `Politician` shape,
// WITHOUT changing lib/types or components/caricature-card.tsx. This keeps the
// mock-driven market detail stable while the cards themselves run on real data.

const NO_PARTY = "ללא סיעה";
const DEFAULT_ROLE = "חבר/ת הכנסת";

/** factionId → one of the 8 categorical color slots (1–8). */
function catFor(factionId: number | null): CatColor {
  return (((factionId ?? 0) % 8) + 1) as CatColor;
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
