import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MarketCard } from "@/components/market-card";
import { createBinaryMarket, createMultiMarket } from "@/components/story-mocks";

/**
 * Feed card (Feature tier). The whole card links to the market; hover lifts it.
 * Avatars come from `marketPoliticians`, which resolves `politicianIds` against
 * the seeded mock politicians — keep ids in the mock set (`bibi`, `lapid`, …).
 */
const meta = {
  title: "Cards/MarketCard",
  component: MarketCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  argTypes: {
    market: { control: "object" },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarketCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Binary: Story = {
  args: { market: createBinaryMarket() },
};

export const Multi: Story = {
  args: { market: createMultiMarket() },
};

export const NotHot: Story = {
  args: { market: createBinaryMarket({ hot: false }) },
};

export const ClosingSoon: Story = {
  args: {
    market: createBinaryMarket({
      hot: true,
      closeAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
    }),
  },
};
