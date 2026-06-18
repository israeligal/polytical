import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DuelSuggestionCard, ChallengeButton } from "@/components/duel/challenge-cta";
import { createBinaryMarket } from "@/components/story-mocks";

const closeBet = createBinaryMarket({
  question: "האם הצעת חוק הגיוס תעבור בקריאה ראשונה עד יום חמישי?",
  closeAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
});

/**
 * The global-feed hooks that seed a duel: a "suggested close-this-week bet to
 * challenge a friend on" promo card, plus the standalone "bet on this with a
 * friend" button used on market cards / the market page.
 */
const meta = {
  title: "Duel/ChallengeHooks",
  component: DuelSuggestionCard,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DuelSuggestionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SuggestionCard: Story = {
  args: { market: closeBet },
};

export const Button: StoryObj<typeof ChallengeButton> = {
  render: () => (
    <div className="flex flex-col items-center gap-4">
      <ChallengeButton size="md" />
      <ChallengeButton size="sm" />
    </div>
  ),
};
