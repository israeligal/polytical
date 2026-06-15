import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EnactedLawPanel } from "@/components/enacted-law-panel";
import type { BillEnactedLaw } from "@/app/lib/bills/repo";

/**
 * "נחקק כחוק" — shown on a bill page when the bill became one or more enacted
 * laws. Each law carries its in-force/expired status and official topic tags.
 */
const meta = {
  title: "Bills/EnactedLawPanel",
  component: EnactedLawPanel,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div dir="rtl" className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EnactedLawPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

const law = (over: Partial<BillEnactedLaw> & { israelLawId: number; nameHe: string }): BillEnactedLaw => ({
  validityDesc: "תקף",
  publicationDate: new Date("2023-04-03T00:00:00Z"),
  topics: ["ביטחון", "מיסוי"],
  ...over,
});

export const InForce: Story = {
  args: { laws: [law({ israelLawId: 1, nameHe: "חוק הכרה בשפת הסימנים הישראלית, התשפ״ו-2026" })] },
};

export const Expired: Story = {
  args: {
    laws: [law({ israelLawId: 2, nameHe: "חוק הסדרת אירוע הילולת רבי שמעון בר יוחאי (הוראת שעה), התשפ״ג-2023", validityDesc: "פקע", topics: ["מועדים", "ביטחון הפנים", "דתות"] })],
  },
};

export const MultiLaw: Story = {
  args: {
    laws: [
      law({ israelLawId: 10, nameHe: "חוק התוכנית הכלכלית — פרק א׳" }),
      law({ israelLawId: 11, nameHe: "חוק התוכנית הכלכלית — פרק ב׳", validityDesc: "פקע", topics: ["חינוך"] }),
    ],
  },
};

export const ManyTopics: Story = {
  args: {
    laws: [law({
      israelLawId: 20, nameHe: "חוק התוכנית הכלכלית (תיקוני חקיקה), התשפ״ג-2023",
      topics: ["בנקאות וכספים", "חקלאות", "פנסיה ביטוח ושוק ההון", "צרכנות", "רווחה", "חוקי הסדרים", "תחבורה ובטיחות בדרכים", "תכנון ובנייה", "רשויות מקומיות", "תשתיות"],
    })],
  },
};

/** No enacted law → renders nothing (the panel is conditional). */
export const Empty: Story = { args: { laws: [] } };
