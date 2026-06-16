import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SuggestMarketWizard } from "@/components/suggest-market-wizard";
import type { PoliticianOption } from "@/lib/types";

/**
 * The 3-stage "הצעה לסדר" wizard (the shipped design). Actions are injected, so
 * the story drives the real component with a fake search + a noop submit — no
 * server bundle. Step through שאלה → אפשרויות → פרטים; the progress rail, the
 * slide transitions, and the staggered fields are all live here.
 */
const CATEGORIES = [
  { key: "coalition", he: "קואליציה" },
  { key: "opposition", he: "אופוזיציה" },
  { key: "legislation", he: "חקיקה" },
  { key: "security", he: "ביטחון וחוץ" },
  { key: "economy", he: "כלכלה" },
];

const POLS: PoliticianOption[] = [
  { personId: 1, nameHe: "בנימין נתניהו", roleHe: "ראש הממשלה", imageUrl: null },
  { personId: 2, nameHe: "יאיר לפיד", roleHe: "יו״ר האופוזיציה", imageUrl: null },
  { personId: 3, nameHe: "בני גנץ", roleHe: "ח״כ", imageUrl: null },
  { personId: 4, nameHe: "נפתלי בנט", roleHe: "לשעבר רה״מ", imageUrl: null },
  { personId: 5, nameHe: "אביגדור ליברמן", roleHe: "ח״כ", imageUrl: null },
];

const searchPoliticians = async ({ q }: { q: string }) =>
  POLS.filter((p) => p.nameHe.includes(q.trim())).slice(0, 6);

const onSubmit = async () => {
  await new Promise((r) => setTimeout(r, 600));
  return { ok: true as const, message: "ההצעה נשלחה לבדיקה (הדגמה)" };
};

const meta = {
  title: "Forms/SuggestMarket — Wizard",
  component: SuggestMarketWizard,
  parameters: { layout: "fullscreen" },
  args: { categories: CATEGORIES, searchPoliticians, onSubmit },
  decorators: [
    (Story) => (
      <div dir="rtl" className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SuggestMarketWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithPreselectedPolitician: Story = {
  args: { defaultPolitician: POLS[0] },
};
