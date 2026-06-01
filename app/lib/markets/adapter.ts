import type { CatColor, Category, Market, Outcome } from "@/lib/types";
import type { MarketRow, OutcomeRow } from "./repo";

// Maps a market bundle (DB rows from `repo.getMarketBundle` / `listOpenMarkets`)
// → the existing front-end `Market` shape, WITHOUT changing lib/types or the
// odds-bar / market-card components. The DB is the system of record; this keeps
// the rendering layer stable while the markets themselves run on real data.
//
//  - `question`     ← questionHe
//  - `closeAt`      ← ISO string (components format it client-side)
//  - `outcomes[]`   ← { id, label: labelHe, pool: poolTotal, color: cat }
//  - `politicianIds`← personIds as strings (matches Politician.id = String(personId))

/** Narrows the free-text DB `cat` slot to the CatColor union (1..8), else undefined. */
function toCatColor(cat: number | null): CatColor | undefined {
  if (cat == null) return undefined;
  return cat >= 1 && cat <= 8 ? (cat as CatColor) : undefined;
}

function outcomeToView(row: OutcomeRow): Outcome {
  return {
    id: row.id,
    label: row.labelHe,
    pool: row.poolTotal,
    color: toCatColor(row.cat),
  };
}

export function bundleToMarket({
  market,
  outcomes,
  personIds,
}: {
  market: MarketRow;
  outcomes: OutcomeRow[];
  personIds: number[];
}): Market {
  return {
    id: market.id,
    question: market.questionHe,
    // `category` is stored as free text in the DB but always written from the
    // Category union by the seed/admin paths; cast back for the view layer.
    category: market.category as Category,
    type: market.type,
    outcomes: outcomes.map(outcomeToView),
    closeAt: market.closeAt.toISOString(),
    hot: market.hot,
    politicianIds: personIds.map(String),
  };
}
