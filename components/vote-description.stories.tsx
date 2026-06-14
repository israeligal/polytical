import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { VoteItemRow } from "@/app/lib/votes/read-repo";
import type { politicians } from "@/app/lib/schema";
import { VoteDescription } from "./vote-description";

const meta = {
  title: "Votes/VoteDescription",
  component: VoteDescription,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VoteDescription>;
export default meta;
type Story = StoryObj<typeof meta>;

const baseItem: VoteItemRow = {
  id: "00000000-0000-0000-0000-000000000001",
  itemId: 2229413,
  itemTypeId: 2,
  descriptionHe:
    "מטרת החוק היא להכיר בשפת הסימנים הישראלית, על ידי הסמכת האקדמיה ללשון העברית לשמר, לפתח ולקדם את שפת הסימנים הישראלית. שר התרבות והספורט ממונה על ביצוע החוק.",
  descriptionSource: "summary_law",
  legislationUrl: "https://main.knesset.gov.il/apps/legislation/main/bills/2229413",
  docUrl: "https://fs.knesset.gov.il/25/law/25_lsr_13479239.pdf",
  docTypeDescHe: "חוק - פרסום ברשומות",
  initiatorPersonId: null,
  sourceDataset: "odata:KNS_Bill+KNS_DocumentBill",
  sourceUrl: "https://example.test",
  fetchedAt: new Date("2026-06-12T00:00:00Z"),
};

const initiator: typeof politicians.$inferSelect = {
  id: "00000000-0000-0000-0000-000000000002",
  personId: 30895,
  mkSiteId: null,
  nameHe: "עדי עזוז",
  nameEn: null,
  party: "הליכוד",
  factionId: null,
  roleHe: "חבר/ת כנסת",
  inKnessetSince: null,
  dob: null,
  facts: {},
  imageUrl: null,
  gender: "female",
  active: true,
  searchName: "עדי עזוז",
  billsCurrent: null,
  billsLifetime: null,
  queriesCurrent: null,
  queriesLifetime: null,
  activityCountsFetchedAt: null,
  sourceDataset: "odata:KNS_Person",
  sourceUrl: "https://example.test",
  fetchedAt: new Date("2026-06-12T00:00:00Z"),
};

export const BillWithSummary: Story = {
  args: { item: { item: baseItem, initiator: null } },
};

export const LinksOnly: Story = {
  args: { item: { item: { ...baseItem, descriptionHe: null, descriptionSource: null }, initiator: null } },
};

export const LongExplanatoryNotes: Story = {
  args: {
    item: {
      item: {
        ...baseItem,
        descriptionSource: "explanatory_notes",
        descriptionHe: Array.from(
          { length: 6 },
          () => "סעיף 22א לחוק זכויות נפגעי עבירה עוסק בנטילת דגימות פורנזיות מנפגעי עבירות מין ובשמירתן.",
        ).join("\n"),
      },
      initiator: null,
    },
  },
};

export const AgendaMotionWithInitiator: Story = {
  args: {
    item: {
      item: {
        ...baseItem,
        itemId: 2243980,
        itemTypeId: 4,
        descriptionSource: "motion_text",
        descriptionHe: "מדינת ישראל מצויה במצב חירום ביטחוני מתמשך, ועל הממשלה לפעול לחיזוק החוסן האזרחי.",
        legislationUrl: null,
        docUrl: "https://fs.knesset.gov.il/25/agendasuggestion/25_as_13440018.pdf",
        docTypeDescHe: "נוסח הצעה לסדר היום",
        initiatorPersonId: 30895,
        sourceDataset: "odata:KNS_Agenda+KNS_DocumentAgenda",
      },
      initiator,
    },
  },
};
