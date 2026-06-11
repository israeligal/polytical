import type { Market, Politician } from "@/lib/types";
import type { LeaderboardEntry } from "@/lib/leaderboard";

/**
 * Mock-data factories for Storybook only (the `*.stories.tsx` files import
 * from here). Factories return fresh objects so a story mutating args can never
 * leak into another. Shapes mirror `lib/types.ts` exactly.
 */
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

export function createPolitician(overrides: Partial<Politician> = {}): Politician {
  return {
    id: "bibi",
    name: "בנימין נתניהו",
    party: "הליכוד",
    role: "ראש הממשלה",
    cat: 1,
    tagline: "השחקן הוותיק של הזירה",
    facts: [
      { label: "גיל", value: "76" },
      { label: "בכנסת מאז", value: "1988" },
      { label: "תפקיד", value: "ראש הממשלה" },
      { label: "כהונות כרה״מ", value: "3" },
    ],
    ...overrides,
  };
}

export function createBinaryMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: "early-elections",
    category: "elections",
    type: "binary",
    hot: true,
    question: "האם יוכרזו בחירות מוקדמות עד סוף 2026?",
    closeAt: inDays(21),
    politicianIds: ["bibi", "lapid"],
    outcomes: [
      { id: "yes", label: "כן", predictors: 4200 },
      { id: "no", label: "לא", predictors: 9800 },
    ],
    ...overrides,
  };
}

export function createMultiMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: "next-finance-minister",
    category: "personnel",
    type: "multi",
    question: "מי יכהן כשר האוצר בתום השנה?",
    closeAt: inDays(10),
    politicianIds: ["smotrich", "liberman"],
    outcomes: [
      { id: "smotrich", label: "סמוטריץ׳", predictors: 5400, color: 5 },
      { id: "barkat", label: "ניר ברקת", predictors: 2100, color: 1 },
      { id: "liberman", label: "ליברמן", predictors: 1200, color: 7 },
      { id: "other", label: "אחר", predictors: 1300, color: 4 },
    ],
    ...overrides,
  };
}

export function createLeaderboardEntry(
  overrides: Partial<LeaderboardEntry> = {},
): LeaderboardEntry {
  return {
    rank: 1,
    handle: "knesset_nerd",
    totalWins: 81,
    totalResolved: 100,
    accuracy: 81,
    ...overrides,
  };
}

export function createVoteTotals(
  overrides: Partial<import("@/components/vote-totals-bar").VoteTotals> = {},
): import("@/components/vote-totals-bar").VoteTotals {
  return {
    totalFor: 54,
    totalAgainst: 38,
    totalAbstain: 4,
    ...overrides,
  };
}
