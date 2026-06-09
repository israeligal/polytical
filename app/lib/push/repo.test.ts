import { beforeEach, afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, pushSubscriptions } from "@/app/lib/schema";
import {
  upsertSubscription,
  listByUser,
  deleteByEndpoint,
  deleteByUserAndEndpoint,
} from "./repo";

let h: Awaited<ReturnType<typeof createTestDb>>;

const U1 = "u1";
const U2 = "u2";
const ENDPOINT = "https://fcm.example/u1-device-a";

/** Inserts a user row (the FK target) using the same shape the market tests use. */
async function seedUser(id: string) {
  await h.db.insert(users).values({ id, name: id, email: `${id}@x.co` });
}

beforeEach(async () => {
  h = await createTestDb();
});
afterEach(async () => {
  await h.close();
});

test("upsertSubscription on the same endpoint twice rebinds to the latest user + keys (1 row)", async () => {
  await seedUser(U1);
  await seedUser(U2);

  await upsertSubscription({
    db: h.db,
    userId: U1,
    endpoint: ENDPOINT,
    p256dh: "p256-v1",
    auth: "auth-v1",
  });
  // Re-subscribe: same endpoint, different user + rotated keys.
  await upsertSubscription({
    db: h.db,
    userId: U2,
    endpoint: ENDPOINT,
    p256dh: "p256-v2",
    auth: "auth-v2",
  });

  // Exactly one row survives (UNIQUE(endpoint)), rebound to the 2nd user + keys.
  const rows = await h.db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, ENDPOINT));
  expect(rows.length).toBe(1);
  expect(rows[0].userId).toBe(U2);
  expect(rows[0].p256dh).toBe("p256-v2");
  expect(rows[0].auth).toBe("auth-v2");
});

test("listByUser returns only the caller's subscriptions", async () => {
  await seedUser(U1);
  await seedUser(U2);

  await upsertSubscription({
    db: h.db,
    userId: U1,
    endpoint: "https://fcm.example/u1-a",
    p256dh: "p1",
    auth: "a1",
  });
  await upsertSubscription({
    db: h.db,
    userId: U1,
    endpoint: "https://fcm.example/u1-b",
    p256dh: "p2",
    auth: "a2",
  });
  // A different user's subscription must be excluded.
  await upsertSubscription({
    db: h.db,
    userId: U2,
    endpoint: "https://fcm.example/u2-a",
    p256dh: "p3",
    auth: "a3",
  });

  const u1Subs = await listByUser({ db: h.db, userId: U1 });
  expect(u1Subs.length).toBe(2);
  expect(u1Subs.every((s) => s.userId === U1)).toBe(true);
  expect(new Set(u1Subs.map((s) => s.endpoint))).toEqual(
    new Set(["https://fcm.example/u1-a", "https://fcm.example/u1-b"]),
  );

  const u2Subs = await listByUser({ db: h.db, userId: U2 });
  expect(u2Subs.length).toBe(1);
  expect(u2Subs[0].endpoint).toBe("https://fcm.example/u2-a");
});

test("deleteByEndpoint prunes the endpoint regardless of owner", async () => {
  await seedUser(U1);
  await upsertSubscription({
    db: h.db,
    userId: U1,
    endpoint: ENDPOINT,
    p256dh: "p",
    auth: "a",
  });

  await deleteByEndpoint({ db: h.db, endpoint: ENDPOINT });

  // Observable end-state: the user now has no subscriptions.
  expect(await listByUser({ db: h.db, userId: U1 })).toEqual([]);
});

test("deleteByUserAndEndpoint no-ops for the wrong user, deletes for the right one", async () => {
  await seedUser(U1);
  await seedUser(U2);
  await upsertSubscription({
    db: h.db,
    userId: U1,
    endpoint: ENDPOINT,
    p256dh: "p",
    auth: "a",
  });

  // Wrong owner: nothing deleted, row still present.
  const wrong = await deleteByUserAndEndpoint({ db: h.db, userId: U2, endpoint: ENDPOINT });
  expect(wrong).toEqual({ deleted: 0 });
  const stillThere = await h.db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, ENDPOINT));
  expect(stillThere.length).toBe(1);
  expect(stillThere[0].userId).toBe(U1);

  // Correct owner: one row deleted, gone.
  const right = await deleteByUserAndEndpoint({ db: h.db, userId: U1, endpoint: ENDPOINT });
  expect(right).toEqual({ deleted: 1 });
  expect(await listByUser({ db: h.db, userId: U1 })).toEqual([]);
});
