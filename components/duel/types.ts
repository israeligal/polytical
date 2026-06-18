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
  /** Signed in? A logged-out pick routes to signup (accept = signup). */
  isLoggedIn?: boolean;
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
