// Core domain types for Polytical (v1 mock layer; mirrors the PRD data model).

export type Category =
  | "elections"
  | "coalition"
  | "security"
  | "legislation"
  | "personnel"
  | "scandals";

/** Categorical color slot (1–8) — assigned to a party / multi-option outcome from data. */
export type CatColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface PoliticianFact {
  label: string;
  value: string;
}

export interface Politician {
  id: string;
  name: string;
  party: string;
  role: string;
  cat: CatColor;
  /** Short neutral editorial epithet (NOT an attributed quote). */
  tagline: string;
  facts: PoliticianFact[];
  /** AI caricature; absent in v1 → styled fallback frame is rendered. */
  imageUrl?: string;
}

export interface Outcome {
  id: string;
  label: string;
  /** Count of users who predicted this outcome (the crowd-split denominator). */
  predictors: number;
  /** Multi-option markets only; binary uses the positive/negative tokens by order. */
  color?: CatColor;
}

export interface Market {
  id: string;
  question: string;
  category: Category;
  type: "binary" | "multi";
  outcomes: Outcome[];
  closeAt: string; // ISO
  hot?: boolean;
  politicianIds: string[];
}

export interface CurrentUser {
  handle: string;
  rank: number;
  accuracy: number; // 0–100
  totalWins: number;
  totalResolved: number;
}
