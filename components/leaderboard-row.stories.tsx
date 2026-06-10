import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LeaderboardRow } from "@/components/leaderboard-row";
import { createLeaderboardEntry } from "@/components/story-mocks";

/** A single leaderboard row. `you` highlights the current user with a primary tint. */
const meta = {
  title: "Leaderboard/LeaderboardRow",
  component: LeaderboardRow,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  argTypes: {
    you: { control: "boolean" },
    entry: { control: "object" },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LeaderboardRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { entry: createLeaderboardEntry(), you: false },
};

export const You: Story = {
  args: {
    entry: createLeaderboardEntry({ rank: 142, handle: "gal", totalWins: 32, totalResolved: 50, accuracy: 64 }),
    you: true,
  },
};

/** Hebrew handles are bidi-isolated (<bdi>) so @ + digits don't scramble in RTL. */
export const HebrewHandle: Story = {
  args: {
    entry: createLeaderboardEntry({ rank: 7, handle: "קואליציה_זריזה_42", totalWins: 61, totalResolved: 80, accuracy: 76 }),
    you: false,
  },
};

export const List: Story = {
  args: { entry: createLeaderboardEntry() },
  render: () => (
    <div className="flex flex-col gap-2">
      <LeaderboardRow entry={createLeaderboardEntry({ rank: 1, handle: "knesset_nerd", totalWins: 81, totalResolved: 100, accuracy: 81 })} />
      <LeaderboardRow entry={createLeaderboardEntry({ rank: 2, handle: "polldancer", totalWins: 78, totalResolved: 100, accuracy: 78 })} />
      <LeaderboardRow entry={createLeaderboardEntry({ rank: 3, handle: "biko2026", totalWins: 52, totalResolved: 70, accuracy: 74 })} />
      <LeaderboardRow entry={createLeaderboardEntry({ rank: 142, handle: "gal", totalWins: 32, totalResolved: 50, accuracy: 64 })} you />
    </div>
  ),
};
