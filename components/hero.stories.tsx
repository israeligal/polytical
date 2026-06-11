import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { HeroSpotlight, HotRail } from "@/components/hero";
import { MarketCard } from "@/components/market-card";
import {
  createBinaryMarket,
  createMultiMarket,
  createPolitician,
} from "@/components/story-mocks";

/**
 * Candidate TOP SECTIONS for the homepage (Polymarket-style, content-first —
 * no marketing copy). Three layouts to choose from:
 *  - SpotlightAndRail: featured market panel + ranked "hot now" list (the one
 *    currently wired into `app/page.tsx`)
 *  - FullWidthSpotlight: one big featured market, nothing else
 *  - ThreeUp: three equal feed cards, no single hero market
 */

// Multi market whose outcomes ARE politicians (personId ↔ politician.id).
const heroPoliticians = [
  createPolitician({ id: "90", name: "בנימין נתניהו", party: "הליכוד", cat: 1 }),
  createPolitician({ id: "120", name: "נפתלי בנט", party: "ימינה", role: "לשעבר רה״מ", cat: 3 }),
  createPolitician({ id: "130", name: "יאיר לפיד", party: "יש עתיד", role: "יו״ר האופוזיציה", cat: 2 }),
];

const heroMarket = createMultiMarket({
  id: "next-pm",
  question: "מי ירכיב את הממשלה הבאה?",
  hot: true,
  outcomes: [
    { id: "bennett", label: "נפתלי בנט", predictors: 6100, color: 3, personId: 120 },
    { id: "bibi", label: "בנימין נתניהו", predictors: 4900, color: 1, personId: 90 },
    { id: "lapid", label: "יאיר לפיד", predictors: 1400, color: 2, personId: 130 },
    { id: "gantz", label: "בני גנץ", predictors: 800, color: 6 },
    { id: "other", label: "אחר", predictors: 500, color: 4 },
  ],
});

const railItems = [
  { market: createBinaryMarket(), predictors: 14_000, leaderPct: "70%" },
  {
    market: createMultiMarket({ id: "fin", question: "מי יכהן כשר האוצר בתום השנה?" }),
    predictors: 10_000,
    leaderPct: "54%",
  },
  {
    market: createBinaryMarket({
      id: "budget",
      hot: false,
      question: "האם התקציב יעבור בקריאה שלישית עד מרץ?",
    }),
    predictors: 7300,
    leaderPct: "61%",
  },
  {
    market: createBinaryMarket({
      id: "coalition-61",
      hot: false,
      question: "האם הקואליציה תשמור על 61 מנדטים עד הקיץ?",
    }),
    predictors: 5200,
    leaderPct: "48%",
  },
  {
    market: createBinaryMarket({
      id: "rotation",
      hot: false,
      question: "האם הרוטציה תתקיים במועד שנקבע?",
    }),
    predictors: 3900,
    leaderPct: "33%",
  },
];

function SectionFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="border-b border-border bg-muted">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {children}
      </div>
    </section>
  );
}

const meta = {
  title: "Sections/Hero",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Option A (wired in): spotlight panel + ranked hot-now rail — the closest
 *  analog to Polymarket's featured carousel + Hot Topics. */
export const SpotlightAndRail: Story = {
  render: () => (
    <SectionFrame>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <HeroSpotlight
            market={heroMarket}
            featured={heroPoliticians}
            badge="התחזית החמה של היום"
          />
        </div>
        <HotRail items={railItems} />
      </div>
    </SectionFrame>
  ),
};

/** Option B: one big featured market across the full width — maximal focus,
 *  zero competing elements. */
export const FullWidthSpotlight: Story = {
  render: () => (
    <SectionFrame>
      <HeroSpotlight
        market={heroMarket}
        featured={heroPoliticians}
        badge="התחזית החמה של היום"
      />
    </SectionFrame>
  ),
};

/** Option C: three equal feed cards — a "today's edition" strip with no single
 *  hero market (closest to Polymarket's all-markets card row). */
export const ThreeUp: Story = {
  render: () => (
    <SectionFrame>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MarketCard market={heroMarket} featured={heroPoliticians} />
        <MarketCard market={railItems[0].market} />
        <MarketCard market={railItems[1].market} />
      </div>
    </SectionFrame>
  ),
};
