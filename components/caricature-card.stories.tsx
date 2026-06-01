import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CaricatureCard } from "@/components/caricature-card";
import { createPolitician } from "@/components/story-mocks";

/**
 * The collectible caricature card — the hero artifact of the product.
 * `realData` flips the footer from a live market count to the neutral
 * "קלף שחקן" badge (DB-backed MKs have no mock markets).
 */
const meta = {
  title: "Cards/CaricatureCard",
  component: CaricatureCard,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    realData: { control: "boolean" },
    politician: { control: "object" },
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CaricatureCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// `bibi` exists in lib/mock-data so the mock-market count resolves.
export const Default: Story = {
  args: { politician: createPolitician(), realData: false },
};

export const RealData: Story = {
  args: { politician: createPolitician(), realData: true },
};

export const OppositionLeader: Story = {
  args: {
    politician: createPolitician({
      id: "lapid",
      name: "יאיר לפיד",
      party: "יש עתיד",
      role: "יו״ר האופוזיציה",
      cat: 2,
      tagline: "איש התקשורת שהפך לפוליטיקאי",
      facts: [
        { label: "גיל", value: "62" },
        { label: "בכנסת מאז", value: "2013" },
        { label: "תפקיד", value: "יו״ר האופוזיציה" },
        { label: "מנדטים", value: "24" },
      ],
    }),
    realData: false,
  },
};

export const CategoricalRed: Story = {
  args: {
    politician: createPolitician({
      id: "bengvir",
      name: "איתמר בן גביר",
      party: "עוצמה יהודית",
      role: "השר לביטחון לאומי",
      cat: 6,
      tagline: "השר לביטחון לאומי",
    }),
    realData: true,
  },
};
