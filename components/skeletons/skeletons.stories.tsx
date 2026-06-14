import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { HomeSkeleton } from "./home-skeleton";
import { MyMatchSkeleton, VoteDetailSkeleton, VotesFeedSkeleton } from "./votes-skeletons";
import { CollectionSkeleton, PoliticianSkeleton, PoliticiansSkeleton } from "./politician-skeletons";
import { BillSkeleton } from "./bill-skeleton";
import { AgendaSkeleton } from "./agenda-skeleton";
import { MarketSkeleton, MarketsPageSkeleton, NotificationsSkeleton, ProfileSkeleton, SearchSkeleton } from "./misc-skeletons";
import { GroupsListSkeleton, GroupHomeSkeleton, GroupFormSkeleton } from "./groups-skeleton";

// Every route skeleton, browsable side-by-side with the app. THE REVIEW RULE:
// when a page's sections change, open its story next to the real page — the
// skeleton must show the same section order and shapes. Container/grid classes
// can't drift (pages import the same constants from ./containers); inner
// blocks are kept honest by this gallery.
const meta = {
  title: "Loading/RouteSkeletons",
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** Asserts the a11y contract every skeleton must carry. */
async function expectStatusRegion(canvasElement: HTMLElement, label: string) {
  const canvas = within(canvasElement);
  const region = canvas.getByRole("status");
  await expect(region).toHaveAttribute("aria-busy", "true");
  await expect(region).toHaveAttribute("aria-label", label);
}

export const Home: Story = {
  render: () => <HomeSkeleton />,
  play: async ({ canvasElement }) => expectStatusRegion(canvasElement, "טוען את פוליטיקל"),
};

export const VotesFeed: Story = {
  render: () => <VotesFeedSkeleton />,
  play: async ({ canvasElement }) => expectStatusRegion(canvasElement, "טוען הצבעות"),
};

export const VotesFeedMobile: Story = {
  render: () => <VotesFeedSkeleton />,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const VoteDetail: Story = {
  render: () => <VoteDetailSkeleton />,
  play: async ({ canvasElement }) => expectStatusRegion(canvasElement, "טוען הצבעה"),
};

export const MyMatch: Story = {
  render: () => <MyMatchSkeleton />,
  play: async ({ canvasElement }) => expectStatusRegion(canvasElement, "טוען התאמה"),
};

export const Politician: Story = {
  render: () => <PoliticianSkeleton />,
  play: async ({ canvasElement }) => expectStatusRegion(canvasElement, "טוען פוליטיקאי"),
};

export const Bill: Story = {
  render: () => <BillSkeleton />,
  play: async ({ canvasElement }) => expectStatusRegion(canvasElement, "טוען הצעת חוק"),
};

export const Agenda: Story = {
  render: () => <AgendaSkeleton />,
  play: async ({ canvasElement }) => expectStatusRegion(canvasElement, "טוען את סדר היום"),
};

export const PoliticiansGallery: Story = {
  render: () => <PoliticiansSkeleton />,
};

export const Collection: Story = {
  render: () => <CollectionSkeleton />,
};

export const Profile: Story = {
  render: () => <ProfileSkeleton />,
  play: async ({ canvasElement }) => expectStatusRegion(canvasElement, "טוען פרופיל"),
};

export const MarketDetail: Story = {
  render: () => <MarketSkeleton />,
};

export const SearchEmptyState: Story = {
  render: () => <SearchSkeleton />,
};

export const Notifications: Story = {
  render: () => <NotificationsSkeleton />,
};

export const MarketsFeed: Story = {
  render: () => <MarketsPageSkeleton />,
  play: async ({ canvasElement }) => expectStatusRegion(canvasElement, "טוען תחזיות"),
};

export const GroupsList: Story = {
  render: () => <GroupsListSkeleton />,
  play: async ({ canvasElement }) => expectStatusRegion(canvasElement, "טוען קואליציות"),
};

export const GroupHome: Story = {
  render: () => <GroupHomeSkeleton />,
  play: async ({ canvasElement }) => expectStatusRegion(canvasElement, "טוען קואליציה"),
};

export const GroupForm: Story = {
  render: () => <GroupFormSkeleton />,
  play: async ({ canvasElement }) => expectStatusRegion(canvasElement, "טוען טופס"),
};
