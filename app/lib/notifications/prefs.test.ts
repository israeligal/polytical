import { beforeEach, afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users } from "@/app/lib/schema";
import {
  getMutedPushTypes,
  getMutedPushTypesForUsers,
  setPushCategoryMuted,
} from "./prefs";
import { InvalidPushPrefError, MissingUserError } from "@/app/lib/errors";

let h: Awaited<ReturnType<typeof createTestDb>>;

async function seedUser(id: string) {
  await h.db.insert(users).values({ id, name: id, email: `${id}@x.co` });
}

beforeEach(async () => {
  h = await createTestDb();
  await seedUser("u1");
});
afterEach(async () => h.close());

test("a fresh user has no muted push types", async () => {
  expect(await getMutedPushTypes({ db: h.db, userId: "u1" })).toEqual([]);
});

test("muting the 'outcomes' category adds its three types; unmuting removes them", async () => {
  const after = await setPushCategoryMuted({ db: h.db, userId: "u1", category: "outcomes", muted: true });
  expect(new Set(after.mutedPushTypes)).toEqual(new Set(["bet_won", "market_resolved", "market_voided"]));
  // persisted
  const [row] = await h.db.select({ m: users.mutedPushTypes }).from(users).where(eq(users.id, "u1"));
  expect(new Set(row.m)).toEqual(new Set(["bet_won", "market_resolved", "market_voided"]));

  const back = await setPushCategoryMuted({ db: h.db, userId: "u1", category: "outcomes", muted: false });
  expect(back.mutedPushTypes).toEqual([]);
});

test("categories are independent — muting 'closing' leaves 'season' alone", async () => {
  await setPushCategoryMuted({ db: h.db, userId: "u1", category: "closing", muted: true });
  await setPushCategoryMuted({ db: h.db, userId: "u1", category: "season", muted: true });
  const muted = new Set(await getMutedPushTypes({ db: h.db, userId: "u1" }));
  expect(muted).toEqual(new Set(["market_closing_soon", "season_reward"]));

  await setPushCategoryMuted({ db: h.db, userId: "u1", category: "closing", muted: false });
  expect(await getMutedPushTypes({ db: h.db, userId: "u1" })).toEqual(["season_reward"]);
});

test("getMutedPushTypesForUsers batches; users with nothing muted are absent from the map", async () => {
  await seedUser("u2");
  await setPushCategoryMuted({ db: h.db, userId: "u1", category: "closing", muted: true });
  const map = await getMutedPushTypesForUsers({ db: h.db, userIds: ["u1", "u2", "ghost"] });
  expect(map.get("u1")).toEqual(new Set(["market_closing_soon"]));
  // u2 has a row but empty array → present with empty set; ghost (no row) absent
  expect(map.get("u2")).toEqual(new Set());
  expect(map.has("ghost")).toBe(false);
});

test("an unknown category throws InvalidPushPrefError (no silent no-op)", async () => {
  await expect(
    setPushCategoryMuted({ db: h.db, userId: "u1", category: "nonsense", muted: true }),
  ).rejects.toBeInstanceOf(InvalidPushPrefError);
});

test("a missing userId throws MissingUserError", async () => {
  await expect(getMutedPushTypes({ db: h.db, userId: "" })).rejects.toBeInstanceOf(MissingUserError);
});
