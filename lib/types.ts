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
  /** The politician this outcome IS (multi candidate rows) — politicians.personId. */
  personId?: number;
}

/** Market kind: binary כן/לא vs multi (single-pick among many candidates). */
export type MarketKind = "binary" | "multi";

/** One outcome as submitted by the admin create form (label + the politician it IS). */
export interface OutcomeInput {
  labelHe: string;
  personId?: number;
}

/** A politician autocomplete hit (admin form picker) — resolved by stable personId. */
export interface PoliticianOption {
  personId: number;
  nameHe: string;
  roleHe: string | null;
  /** AI caricature path (e.g. /caricatures/<personId>.png); null when not yet generated. */
  imageUrl?: string | null;
}

export interface Market {
  id: string;
  question: string;
  category: Category;
  type: MarketKind;
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
