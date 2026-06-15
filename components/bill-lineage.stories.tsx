import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BillLineage } from "@/components/bill-lineage";

/**
 * Split-bill lineage line. `asLink` (default) on the bill page; `asLink={false}`
 * inside an agenda card (already a Link → no nested anchor).
 */
const meta = {
  title: "Bills/BillLineage",
  component: BillLineage,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div dir="rtl" className="mx-auto max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BillLineage>;
export default meta;
type Story = StoryObj<typeof meta>;

const parent = {
  billId: 2203821,
  nameHe: "חוק התוכנית הכלכלית (תיקוני חקיקה ליישום המדיניות הכלכלית לשנות התקציב 2023 ו-2024), התשפ״ג-2023",
};

export const AsLink: Story = { args: { parent } };

export const AsText: Story = { args: { parent, asLink: false } };
