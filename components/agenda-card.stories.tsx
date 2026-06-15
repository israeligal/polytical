import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AgendaCard } from "@/components/agenda-card";
import type { AgendaFeedItem, AgendaInitiator } from "@/app/lib/agenda/read-repo";

/**
 * The "על סדר היום" feed card: a bill heading to a decisive vote, its proposing
 * MKs as an overlapping caricature cluster, and the k-anonymised community
 * split. Variants cover the gate (split shown vs withheld), the user's own
 * pre-vote, the avatar overflow, and the no-initiators fallback.
 */
const meta = {
  title: "Agenda/AgendaCard",
  component: AgendaCard,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div dir="rtl" className="mx-auto max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AgendaCard>;
export default meta;
type Story = StoryObj<typeof meta>;

let seq = 0;
function mkInitiator(over: Partial<AgendaInitiator> & { nameHe: string }): AgendaInitiator {
  seq += 1;
  return {
    id: `00000000-0000-0000-0000-${String(seq).padStart(12, "0")}`,
    personId: seq,
    mkSiteId: null,
    nameEn: null,
    party: "סיעה",
    factionId: (seq % 6) + 1,
    roleHe: null,
    inKnessetSince: null,
    dob: null,
    facts: {},
    imageUrl: null, // styled fallback frame (no caricature in stories)
    gender: null,
    active: true,
    searchName: over.nameHe,
    billsCurrent: null,
    billsLifetime: null,
    queriesCurrent: null,
    queriesLifetime: null,
    activityCountsFetchedAt: null,
    sourceDataset: "story",
    sourceUrl: "https://story",
    fetchedAt: new Date("2026-06-15T00:00:00Z"),
    ...over,
  };
}

const initiators = [
  mkInitiator({ nameHe: "שמחה רוטמן" }),
  mkInitiator({ nameHe: "מירב בן ארי" }),
  mkInitiator({ nameHe: "גלעד קריב" }),
];

const baseItem: AgendaFeedItem = {
  id: "item-1",
  titleHe: "הצעת חוק זכויות נפגעי עבירה (תיקון – העברת ערכות דגימה), התשפ״ה-2025",
  billId: 2233112,
  expectedDate: "2026-06-22",
  statusDescHe: "הכנה לקריאה שנייה ושלישית",
  forCount: 14,
  againstCount: 7,
  initiators,
  initiatorCount: 3,
  splitParent: null,
};

export const CommunitySplitShown: Story = {
  args: { item: baseItem, community: { forPct: 67, total: 21 }, mine: null },
};

export const WithYourStance: Story = {
  args: { item: baseItem, community: { forPct: 67, total: 21 }, mine: "for" },
};

export const SplitWithheldBelowThreshold: Story = {
  args: {
    item: { ...baseItem, forCount: 2, againstCount: 1 },
    community: { forPct: null, total: 3 },
    mine: null,
  },
};

export const NoStancesYet: Story = {
  args: {
    item: { ...baseItem, forCount: 0, againstCount: 0 },
    community: { forPct: null, total: 0 },
    mine: null,
  },
};

export const ManyInitiatorsOverflow: Story = {
  args: {
    item: {
      ...baseItem,
      initiators: [...initiators, mkInitiator({ nameHe: "אחת" }), mkInitiator({ nameHe: "שתיים" }), mkInitiator({ nameHe: "שלוש" })],
      initiatorCount: 31,
    },
    community: { forPct: 48, total: 55 },
    mine: "against",
  },
};

export const NoInitiators: Story = {
  args: {
    item: { ...baseItem, initiators: [], initiatorCount: 0 },
    community: { forPct: 67, total: 21 },
    mine: null,
  },
};
