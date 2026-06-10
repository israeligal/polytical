import type { CatColor, Category, Market, Outcome } from "@/lib/types";
import type { MarketRow, OutcomeRow } from "./repo";

// Maps a market bundle (DB rows from `repo.getMarketBundle` / `listOpenMarkets`)
// → the front-end `Market` shape. The DB is the system of record; this keeps the
// rendering layer stable while the markets run on real data.
//
//  - `question`     ← questionHe
//  - `closeAt`      ← ISO string (components format it client-side)
//  - `outcomes[]`   ← { id, label: labelHe, predictors: count, color: cat }
//  - `politicianIds`← personIds as strings (matches Politician.id = String(personId))
//
// The per-outcome predictor counts (the crowd-split denominator) are derived live
// via `repo.getOutcomeCounts` and passed in here; absent → 0 (a fresh market with
// no predictions yet shows an empty split, which is correct).

/** Narrows the free-text DB `cat` slot to the CatColor union (1..8), else undefined. */
function toCatColor(cat: number | null): CatColor | undefined {
  if (cat == null) return undefined;
  return cat >= 1 && cat <= 8 ? (cat as CatColor) : undefined;
}

function outcomeToView(row: OutcomeRow, counts?: Map<string, number>): Outcome {
  return {
    id: row.id,
    label: row.labelHe,
    predictors: counts?.get(row.id) ?? 0,
    color: toCatColor(row.cat),
  };
}

export function bundleToMarket({
  market,
  outcomes,
  personIds,
  counts,
}: {
  market: MarketRow;
  outcomes: OutcomeRow[];
  personIds: number[];
  counts?: Map<string, number>;
}): Market {
  return {
    id: market.id,
    question: market.questionHe,
    // `category` is stored as free text in the DB but always written from the
    // Category union by the seed/admin paths; cast back for the view layer.
    category: market.category as Category,
    type: market.type,
    outcomes: outcomes.map((o) => outcomeToView(o, counts)),
    closeAt: market.closeAt.toISOString(),
    hot: market.hot,
    politicianIds: personIds.map(String),
  };
}
