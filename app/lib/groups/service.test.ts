import { beforeEach, afterEach, expect, test } from "vitest";
import { eq, and } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, groups, groupMembers } from "@/app/lib/schema";
import {
  createGroup, joinGroup, leaveGroup, removeMember, getGroupForMember,
} from "./service";
import { getMembership } from "./repo";
import { NotGroupMemberError, InsufficientGroupRoleError, InvalidInviteCodeError } from "@/app/lib/errors";

let h: Awaited<ReturnType<typeof createTestDb>>;

async function seedUsers(ids: string[]) {
  await h.db.insert(users).values(ids.map((id) => ({ id, name: id, email: `${id}@x.co` })));
}

async function defaultGroupId(userId: string) {
  const [u] = await h.db.select({ d: users.defaultGroupId }).from(users).where(eq(users.id, userId));
  return u.d;
}

beforeEach(async () => {
  h = await createTestDb();
});
afterEach(async () => {
  await h.close();
});

test("createGroup makes the caller owner and auto-homes their first group", async () => {
  await seedUsers(["owner"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "הקואליציה" } });

  expect(g.slug).toBeTruthy();
  expect(g.inviteCode).toBeTruthy();
  const m = await getMembership({ db: h.db, groupId: g.id, userId: "owner" });
  expect(m?.role).toBe("owner");
  expect(m?.status).toBe("active");
  expect(await defaultGroupId("owner")).toBe(g.id);
});

test("auto-home only sets the FIRST group, never overrides", async () => {
  await seedUsers(["u"]);
  const g1 = await createGroup({ db: h.db, userId: "u", input: { nameHe: "ראשונה" } });
  const g2 = await createGroup({ db: h.db, userId: "u", input: { nameHe: "שנייה" } });
  expect(g2.id).not.toBe(g1.id);
  expect(await defaultGroupId("u")).toBe(g1.id); // unchanged
});

test("joinGroup is idempotent and auto-homes a first-time joiner", async () => {
  await seedUsers(["owner", "joiner"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });

  await joinGroup({ db: h.db, userId: "joiner", inviteCode: g.inviteCode });
  await joinGroup({ db: h.db, userId: "joiner", inviteCode: g.inviteCode }); // idempotent, no throw

  const rows = await h.db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, "joiner")));
  expect(rows).toHaveLength(1); // composite PK → one row, not duplicated
  expect(rows[0].status).toBe("active");
  expect(await defaultGroupId("joiner")).toBe(g.id);
});

test("a bad invite code is rejected", async () => {
  await seedUsers(["u"]);
  await expect(joinGroup({ db: h.db, userId: "u", inviteCode: "nope" })).rejects.toBeInstanceOf(InvalidInviteCodeError);
});

test("rejoining after leaving restores the frozen group record", async () => {
  await seedUsers(["owner", "m"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  await joinGroup({ db: h.db, userId: "m", inviteCode: g.inviteCode });

  // Simulate an accrued sandboxed record, then leave.
  await h.db
    .update(groupMembers)
    .set({ groupWins: 3, groupResolved: 5 })
    .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, "m")));
  await leaveGroup({ db: h.db, userId: "m", groupId: g.id });

  const left = await getMembership({ db: h.db, groupId: g.id, userId: "m" });
  expect(left?.status).toBe("left");
  expect(left?.groupWins).toBe(3); // frozen, not wiped

  await joinGroup({ db: h.db, userId: "m", inviteCode: g.inviteCode });
  const back = await getMembership({ db: h.db, groupId: g.id, userId: "m" });
  expect(back?.status).toBe("active");
  expect(back?.groupWins).toBe(3); // restored
  expect(back?.groupResolved).toBe(5);
});

test("a departing owner hands off to the longest-tenured ADMIN over an older member", async () => {
  await seedUsers(["owner", "member", "admin"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  // member joins first (older), then admin joins and is promoted.
  await joinGroup({ db: h.db, userId: "member", inviteCode: g.inviteCode });
  await joinGroup({ db: h.db, userId: "admin", inviteCode: g.inviteCode });
  await h.db
    .update(groupMembers)
    .set({ role: "admin" })
    .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, "admin")));

  const res = await leaveGroup({ db: h.db, userId: "owner", groupId: g.id });
  expect(res.deleted).toBe(false);

  const [grp] = await h.db.select().from(groups).where(eq(groups.id, g.id));
  expect(grp.ownerId).toBe("admin"); // admin beats the older plain member
  expect((await getMembership({ db: h.db, groupId: g.id, userId: "admin" }))?.role).toBe("owner");
  expect((await getMembership({ db: h.db, groupId: g.id, userId: "owner" }))?.status).toBe("left");
});

test("a sole owner leaving deletes (archives) the group", async () => {
  await seedUsers(["solo"]);
  const g = await createGroup({ db: h.db, userId: "solo", input: { nameHe: "קבוצה" } });
  const res = await leaveGroup({ db: h.db, userId: "solo", groupId: g.id });
  expect(res.deleted).toBe(true);
  const [grp] = await h.db.select().from(groups).where(eq(groups.id, g.id));
  expect(grp).toBeUndefined();
  expect(await defaultGroupId("solo")).toBeNull(); // FK set null on delete
});

test("removeMember: owner can remove a member; a member cannot; owner is protected", async () => {
  await seedUsers(["owner", "m1", "m2"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  await joinGroup({ db: h.db, userId: "m1", inviteCode: g.inviteCode });
  await joinGroup({ db: h.db, userId: "m2", inviteCode: g.inviteCode });

  await removeMember({ db: h.db, actorId: "owner", groupId: g.id, targetUserId: "m1" });
  expect((await getMembership({ db: h.db, groupId: g.id, userId: "m1" }))?.status).toBe("left");

  await expect(
    removeMember({ db: h.db, actorId: "m2", groupId: g.id, targetUserId: "owner" }),
  ).rejects.toBeInstanceOf(InsufficientGroupRoleError);

  await expect(
    removeMember({ db: h.db, actorId: "owner", groupId: g.id, targetUserId: "owner" }),
  ).rejects.toBeInstanceOf(InsufficientGroupRoleError);
});

test("getGroupForMember gates non-members", async () => {
  await seedUsers(["owner", "stranger"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  const ok = await getGroupForMember({ db: h.db, slug: g.slug, userId: "owner" });
  expect(ok.group.id).toBe(g.id);
  await expect(getGroupForMember({ db: h.db, slug: g.slug, userId: "stranger" })).rejects.toBeInstanceOf(NotGroupMemberError);
});
