import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CoinPill } from "@/components/coin-pill";

/** The play-money balance, in the gold "coin" accent. */
const meta = {
  title: "Economy/CoinPill",
  component: CoinPill,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    amount: { control: { type: "number", min: 0, step: 100 } },
  },
} satisfies Meta<typeof CoinPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { amount: 1840 },
};

export const Zero: Story = {
  args: { amount: 0 },
};

export const Large: Story = {
  args: { amount: 48230 },
};
