import type { Market, Politician } from "@/lib/types";

/**
 * A participant shown in the arena. Identity is the public `@handle` only
 * (never `users.name`) + an optional caricature avatar; `pickedOutcomeId` is
 * the outcome they locked (hidden behind a "?" until the viewer has played).
 */
export interface DuelPlayer {
  handle: string;
  caricatureUrl?: string | null;
  pickedOutcomeId?: string | null;
}

/** One row in the resolved-duel standings — a player, their pick, and flags. */
export interface DuelStanding {
  handle: string;
  caricatureUrl?: string | null;
  /** Their final pick on the market; null if they never locked one. */
  outcomeId: string | null;
  isChallenger?: boolean;
  isYou?: boolean;
}

/** Present once the duel's market has resolved — drives the arena's result state. */
export interface DuelResolution {
  winningOutcomeId: string;
  /** The viewer's head-to-head verdict vs the challenger; null if they didn't play. */
  verdict: "won" | "lost" | "tie" | null;
  standings: DuelStanding[];
  /** Close-this-week markets to rematch on (the resolved market can't be re-dueled). */
  suggestedMarkets?: Market[];
}

export interface DuelArenaProps {
  /** The single market this duel is fought over (the "one close bet"). */
  market: Market;
  /** Resolved politician portraits for the market's outcomes (multi markets). */
  politicians?: Politician[];
  /** The friend who created the challenge and shared the link. */
  challenger: DuelPlayer;
  /** The signed-in viewer, if any — drives the "you" side of the VS band. */
  you?: DuelPlayer;
  /** Handles (+avatars) of others who've already locked a pick — the one-to-many crowd. */
  crowd?: DuelPlayer[];
  /** The viewer's existing pick, if they already played (resumes into the revealed state). */
  myPickId?: string | null;
  /** Set once the market resolved → the arena renders its result state instead of the picker. */
  resolution?: DuelResolution;
  /** Signed in? A logged-out pick routes to signup (accept = signup). */
  isLoggedIn?: boolean;
  /** Where a logged-out visitor goes to save their pick (accept = signup). */
  loginHref?: string;
  /** Canonical share URL; falls back to `window.location.href`. */
  shareUrl?: string;
  /** Called when the viewer locks a pick (real wiring upserts a `bets` row). */
  onPick?: (outcomeId: string) => void | Promise<void>;
}

/** Direction tone for an outcome button — color MEANS direction in this design system. */
export type OutcomeTone =
  | { kind: "positive" } // YES / techelet · mint
  | { kind: "negative" } // NO  / red · coral
  | { kind: "cat"; color: import("@/lib/types").CatColor }; // multi-option party color

export type { Market, Politician };
