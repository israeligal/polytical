import type React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GroupsEmptyState } from "@/components/groups/groups-empty-state";

const meta = {
  title: "Groups/GroupsEmptyState",
  component: GroupsEmptyState,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story: () => React.ReactNode) => (
      <div className="mx-auto w-full max-w-3xl" dir="rtl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GroupsEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The animated "no coalitions yet" empty state shown on /g. */
export const Default: Story = {};
