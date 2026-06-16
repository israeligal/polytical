import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";

// joinGroup/leaveGroup fan out pushes after commit — mock the boundary.
vi.mock("@/app/lib/push/service", () => ({ dispatchPush: vi.fn() }));

import { users } from "@/app/lib/schema";
import { createGroup, joinGroup, leaveGroup } from "./service";
import { resolveActiveCoalition, COALITION_NATIONAL } from "./context";

let h: Awaited<ReturnType<typeof createTestDb>>;

async function seedUsers(ids: string[]) {
  await h.db.insert(users).values(ids.map((id) => ({ id, name: id, email: `${id}@x.co` })));
}

beforeEach(async () => {
  h = await createTestDb();
});
afterEach(async () => {
  await h.close();
});

test("absent cookie seeds the active coalition from the user's default group", async () => {
  await seedUsers(["owner"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "הקואליציה" } });
  const active = await resolveActiveCoalition({
    db: h.db,
    userId: "owner",
    cookieValue: undefined,
    defaultGroupId: g.id,
  });
  expect(active).toBe(g.id);
});

test("explicit national cookie resolves to null even for a member", async () => {
  await seedUsers(["owner"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "הקואליציה" } });
  const active = await resolveActiveCoalition({
    db: h.db,
    userId: "owner",
    cookieValue: COALITION_NATIONAL,
    defaultGroupId: g.id,
  });
  expect(active).toBeNull();
});

test("a coalition cookie for an active member resolves to that coalition", async () => {
  await seedUsers(["owner", "joiner"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  await joinGroup({ db: h.db, inviteCode: g.inviteCode, userId: "joiner" });
  const active = await resolveActiveCoalition({
    db: h.db,
    userId: "joiner",
    cookieValue: g.id,
    defaultGroupId: null,
  });
  expect(active).toBe(g.id);
});

test("heal: a cookie for a group the user has LEFT resolves to null", async () => {
  await seedUsers(["owner", "joiner"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  await joinGroup({ db: h.db, inviteCode: g.inviteCode, userId: "joiner" });
  await leaveGroup({ db: h.db, groupId: g.id, userId: "joiner" });
  const active = await resolveActiveCoalition({
    db: h.db,
    userId: "joiner",
    cookieValue: g.id,
    defaultGroupId: null,
  });
  expect(active).toBeNull();
});

test("heal: a cookie for a group the user was never in resolves to null", async () => {
  await seedUsers(["owner", "stranger"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  const active = await resolveActiveCoalition({
    db: h.db,
    userId: "stranger",
    cookieValue: g.id,
    defaultGroupId: null,
  });
  expect(active).toBeNull();
});

test("anonymous (no userId) is always national", async () => {
  const active = await resolveActiveCoalition({
    db: h.db,
    userId: null,
    cookieValue: "any-group-id",
    defaultGroupId: "some-default",
  });
  expect(active).toBeNull();
});
