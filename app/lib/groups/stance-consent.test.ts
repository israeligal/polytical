import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";

// joinGroup fans out pushes after commit — mock the boundary.
vi.mock("@/app/lib/push/service", () => ({ dispatchPush: vi.fn() }));

import { users, userStances, groupStanceConsent } from "@/app/lib/schema";
import { createGroup, joinGroup, leaveGroup } from "./service";
import { setStanceSharing, getGroupVoteStances, getStanceSharing, getStanceShareStats } from "./stance-service";
import { NotGroupMemberError } from "@/app/lib/errors";

const VOTE = 5000;
let h: Awaited<ReturnType<typeof createTestDb>>;

async function seedUsers(ids: string[]) {
  await h.db.insert(users).values(ids.map((id) => ({ id, name: id, email: `${id}@x.co`, handle: id })));
}
async function stance(userId: string, s: "for" | "against") {
  await h.db.insert(userStances).values({ userId, voteId: VOTE, stance: s });
}
function ids(rows: { userId: string }[]) {
  return rows.map((r) => r.userId).sort();
}

beforeEach(async () => {
  h = await createTestDb();
});
afterEach(async () => {
  await h.close();
});

test("the 4-way reveal gate: directions surface only to consenting members about consenting members", async () => {
  await seedUsers(["owner", "alice", "bob", "stranger"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  await joinGroup({ db: h.db, userId: "alice", inviteCode: g.inviteCode });
  await joinGroup({ db: h.db, userId: "bob", inviteCode: g.inviteCode });
  await stance("owner", "for");
  await stance("alice", "against");
  await stance("bob", "for");

  // owner + alice consent; bob does NOT.
  await setStanceSharing({ db: h.db, groupId: g.id, userId: "owner", share: true });
  await setStanceSharing({ db: h.db, groupId: g.id, userId: "alice", share: true });

  // owner (consenting) sees owner + alice (both consenting), NOT bob (not consenting).
  const ownerView = await getGroupVoteStances({ db: h.db, groupId: g.id, voteId: VOTE, viewerId: "owner" });
  expect(ids(ownerView)).toEqual(["alice", "owner"]);
  expect(ownerView.find((s) => s.userId === "alice")?.stance).toBe("against");

  // bob (member, NOT consenting) → sees nothing (viewer-consent gate).
  expect(await getGroupVoteStances({ db: h.db, groupId: g.id, voteId: VOTE, viewerId: "bob" })).toHaveLength(0);

  // stranger (non-member) → nothing.
  expect(await getGroupVoteStances({ db: h.db, groupId: g.id, voteId: VOTE, viewerId: "stranger" })).toHaveLength(0);
});

test("a consenting member who LEAVES disappears from the reveal (active filter)", async () => {
  await seedUsers(["owner", "alice"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  await joinGroup({ db: h.db, userId: "alice", inviteCode: g.inviteCode });
  await stance("owner", "for");
  await stance("alice", "for");
  await setStanceSharing({ db: h.db, groupId: g.id, userId: "owner", share: true });
  await setStanceSharing({ db: h.db, groupId: g.id, userId: "alice", share: true });

  expect(ids(await getGroupVoteStances({ db: h.db, groupId: g.id, voteId: VOTE, viewerId: "owner" }))).toEqual(["alice", "owner"]);

  await leaveGroup({ db: h.db, userId: "alice", groupId: g.id }); // status → left (consent row remains)
  // alice's direction must vanish from owner's view even though her consent row survives.
  expect(ids(await getGroupVoteStances({ db: h.db, groupId: g.id, voteId: VOTE, viewerId: "owner" }))).toEqual(["owner"]);
});

test("consent toggle is idempotent + membership-gated; un-share hides immediately", async () => {
  await seedUsers(["owner", "alice", "stranger"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  await joinGroup({ db: h.db, userId: "alice", inviteCode: g.inviteCode });
  await stance("owner", "for");
  await stance("alice", "for");

  await setStanceSharing({ db: h.db, groupId: g.id, userId: "alice", share: true });
  await setStanceSharing({ db: h.db, groupId: g.id, userId: "alice", share: true }); // idempotent
  expect(await getStanceSharing({ db: h.db, groupId: g.id, userId: "alice" })).toBe(true);
  expect(await h.db.select().from(groupStanceConsent).where(and(eq(groupStanceConsent.groupId, g.id), eq(groupStanceConsent.userId, "alice")))).toHaveLength(1);

  // a non-member can't opt in
  await expect(setStanceSharing({ db: h.db, groupId: g.id, userId: "stranger", share: true })).rejects.toBeInstanceOf(NotGroupMemberError);

  // owner consents → owner sees alice; alice un-shares → alice vanishes
  await setStanceSharing({ db: h.db, groupId: g.id, userId: "owner", share: true });
  expect(ids(await getGroupVoteStances({ db: h.db, groupId: g.id, voteId: VOTE, viewerId: "owner" }))).toEqual(["alice", "owner"]);
  await setStanceSharing({ db: h.db, groupId: g.id, userId: "alice", share: false });
  expect(ids(await getGroupVoteStances({ db: h.db, groupId: g.id, voteId: VOTE, viewerId: "owner" }))).toEqual(["owner"]);
});

test("share stats = consenting active / total active", async () => {
  await seedUsers(["owner", "alice", "bob"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  await joinGroup({ db: h.db, userId: "alice", inviteCode: g.inviteCode });
  await joinGroup({ db: h.db, userId: "bob", inviteCode: g.inviteCode });
  await setStanceSharing({ db: h.db, groupId: g.id, userId: "owner", share: true });
  await setStanceSharing({ db: h.db, groupId: g.id, userId: "alice", share: true });
  expect(await getStanceShareStats({ db: h.db, groupId: g.id })).toEqual({ sharing: 2, total: 3 });
});
