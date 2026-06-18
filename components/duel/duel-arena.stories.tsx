import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DuelArena } from "@/components/duel/duel-arena";
import { createBinaryMarket, createMultiMarket } from "@/components/story-mocks";
import type { DuelPlayer } from "@/components/duel/types";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

const challenger: DuelPlayer = { handle: "nadav_b", pickedOutcomeId: "no" };
const you: DuelPlayer = { handle: "gal" };
const crowd: DuelPlayer[] = [
  { handle: "vera_m" },
  { handle: "yossi" },
  { handle: "dana_k" },
  { handle: "amit" },
  { handle: "roni" },
  { handle: "tal_s" },
];

/** A "close this week" binary bet — the format the single-link duel is built for. */
const closeBet = createBinaryMarket({
  id: "first-reading-thursday",
  question: "האם הצעת חוק הגיוס תעבור בקריאה ראשונה עד יום חמישי?",
  closeAt: inDays(3),
  hot: true,
  outcomes: [
    { id: "yes", label: "כן", predictors: 612 },
    { id: "no", label: "לא", predictors: 488 },
  ],
});

/**
 * The duel arena — the motion-rich landing a friend opens from a shared single-
 * bet link. Self-themed dark "trading floor"; pick a side to trigger the reveal
 * (crowd split grows in, the challenger's pick flips up, the re-share hook
 * appears). Use the fullscreen layout to see the full choreography.
 */
const meta = {
  title: "Duel/DuelArena",
  component: DuelArena,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DuelArena>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Fresh link, logged-out visitor — picking a side reveals + nudges to sign up. */
export const FreshChallenge: Story = {
  args: { market: closeBet, challenger, crowd, isLoggedIn: false },
};

/** Signed-in viewer — picking reveals and the hook becomes "challenge more friends". */
export const LoggedIn: Story = {
  args: { market: closeBet, challenger, you, crowd, isLoggedIn: true },
};

/** Resumes straight into the revealed state (viewer already played; picks differ → "מי צודק?"). */
export const AlreadyPlayed: Story = {
  args: { market: closeBet, challenger, you, crowd, isLoggedIn: true, myPickId: "yes" },
};

/** A multi-option duel — sides render as stacked, color-coded party rows. */
export const MultiOption: Story = {
  args: {
    market: createMultiMarket({ closeAt: inDays(5) }),
    challenger: { handle: "nadav_b", pickedOutcomeId: "barkat" },
    you,
    crowd,
    isLoggedIn: true,
  },
};
