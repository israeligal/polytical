import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { FaucetButton } from "@/components/faucet-button";
import { __faucetMock } from "../.storybook/mocks/faucet-action";

/**
 * Daily +200 coin faucet. The Server Action is aliased to a Storybook stub
 * (see `.storybook/main.ts`); `__faucetMock` drives the success / cooldown
 * outcomes. The play functions assert the pending → resolved transition.
 */
const meta = {
  title: "Economy/FaucetButton",
  component: FaucetButton,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    // FaucetButton takes no props; these document the stubbed action behavior.
    result: {
      control: "radio",
      options: ["success", "cooldown"],
      description: "Outcome the stubbed Server Action returns",
      table: { category: "Mock action" },
    },
  },
  beforeEach: async () => {
    // Reset the shared stub between stories.
    __faucetMock.result = { ok: true, streak: 1, amount: 200 };
    __faucetMock.delayMs = 300;
    return () => {
      __faucetMock.result = { ok: true, streak: 1, amount: 200 };
      __faucetMock.delayMs = 300;
    };
  },
} satisfies Meta<typeof FaucetButton & { result: "success" | "cooldown" }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Clicking shows the pending label, then surfaces the streak reward on success. */
export const ClaimSucceeds: Story = {
  beforeEach: async () => {
    __faucetMock.result = { ok: true, streak: 1, amount: 200 };
    __faucetMock.delayMs = 300;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button");
    await expect(button).toHaveTextContent("בונוס יומי");

    await userEvent.click(button);
    // Pending state.
    await expect(button).toHaveAttribute("aria-busy", "true");

    // Settles back to idle and shows the streak reward.
    await waitFor(async () => {
      await expect(button).toHaveAttribute("aria-busy", "false");
    });
    await expect(canvas.getByText("🔥 רצף 1 · +200")).toBeInTheDocument();
  },
};

/** A longer streak shows the scaled bonus amount. */
export const StreakBonus: Story = {
  beforeEach: async () => {
    __faucetMock.result = { ok: true, streak: 5, amount: 300 };
    __faucetMock.delayMs = 200;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button");
    await userEvent.click(button);
    await waitFor(async () => {
      await expect(canvas.getByText("🔥 רצף 5 · +300")).toBeInTheDocument();
    });
  },
};

/** On cooldown the stub returns a message; it must surface next to the button. */
export const Cooldown: Story = {
  beforeEach: async () => {
    __faucetMock.result = { ok: false, message: "כבר קיבלתם היום — חזרו מחר" };
    __faucetMock.delayMs = 200;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button");

    await userEvent.click(button);
    await waitFor(async () => {
      await expect(
        canvas.getByText("כבר קיבלתם היום — חזרו מחר"),
      ).toBeInTheDocument();
    });
  },
};
