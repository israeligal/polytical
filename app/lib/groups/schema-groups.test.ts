import { beforeEach, afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import {
  users, groups, groupMembers, markets, notifications,
} from "@/app/lib/schema";

// M1 checkpoint: proves migration 0029 replays into PGLite (incl. the
// `ALTER TYPE notification_type ADD VALUE` statements and the new FK columns),
// and that the group tables + scoping columns are reachable via @/app/lib/schema.

let h: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  h = await createTestDb();
});
afterEach(async () => {
  await h.close();
});

test("groups + group_members tables exist and round-trip", async () => {
  await h.db.insert(users).values({ id: "u1", name: "אבי", email: "a@x.co" });

  const [g] = await h.db
    .insert(groups)
    .values({ slug: "abc123", nameHe: "הקואליציה שלנו", ownerId: "u1", inviteCode: "inv-abc123" })
    .returning();
  expect(g.slug).toBe("abc123");
  expect(g.nameHe).toBe("הקואליציה שלנו");

  await h.db.insert(groupMembers).values({ groupId: g.id, userId: "u1", role: "owner" });
  const [m] = await h.db.select().from(groupMembers).where(eq(groupMembers.groupId, g.id));
  expect(m.role).toBe("owner");
  expect(m.status).toBe("active");
  expect(m.groupWins).toBe(0);
  expect(m.groupResolved).toBe(0);
});

test("markets.groupId + user.defaultGroupId scoping columns exist", async () => {
  await h.db.insert(users).values({ id: "u2", name: "בני", email: "b@x.co" });
  const [g] = await h.db
    .insert(groups)
    .values({ slug: "grp2", nameHe: "מחנה", ownerId: "u2", inviteCode: "inv-grp2" })
    .returning();

  const [mkt] = await h.db
    .insert(markets)
    .values({
      questionHe: "הצעה לסדר?",
      category: "coalition",
      closeAt: new Date(Date.now() + 86_400_000),
      groupId: g.id,
    })
    .returning();
  expect(mkt.groupId).toBe(g.id);

  await h.db.update(users).set({ defaultGroupId: g.id }).where(eq(users.id, "u2"));
  const [u] = await h.db.select().from(users).where(eq(users.id, "u2"));
  expect(u.defaultGroupId).toBe(g.id);
});

test("new group notification enum values + refGroupId are usable", async () => {
  await h.db.insert(users).values({ id: "u3", name: "גלי", email: "c@x.co" });
  const [g] = await h.db
    .insert(groups)
    .values({ slug: "grp3", nameHe: "ליגה", ownerId: "u3", inviteCode: "inv-grp3" })
    .returning();

  await h.db.insert(notifications).values({
    userId: "u3",
    type: "group_motion_posted",
    titleHe: "הצעה חדשה",
    bodyHe: "נוספה הצעה לסדר בקואליציה",
    refGroupId: g.id,
  });
  const [n] = await h.db.select().from(notifications).where(eq(notifications.userId, "u3"));
  expect(n.type).toBe("group_motion_posted");
  expect(n.refGroupId).toBe(g.id);
});
