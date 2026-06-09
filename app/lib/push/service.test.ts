import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

// Mock the external web-push SDK boundary. `sendNotification` is a controllable
// spy; `WebPushError` is a real-ish error class carrying `statusCode` so the
// service's `instanceof WebPushError && statusCode === 410` prune path is real.
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
  WebPushError: class WebPushError extends Error {
    statusCode: number;
    constructor(msg: string, statusCode: number) {
      super(msg);
      this.name = "WebPushError";
      this.statusCode = statusCode;
    }
  },
}));

import webpush, { WebPushError } from "web-push";

// The runtime mock's WebPushError takes (msg, statusCode); the real @types
// signature takes 5 args. Re-type the SAME class value to the mock's 2-arg
// constructor so `new` here matches what the service actually `instanceof`-checks.
const MockWebPushError = WebPushError as unknown as new (
  msg: string,
  statusCode: number,
) => WebPushError;

import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, pushSubscriptions } from "@/app/lib/schema";
import { listByUser, upsertSubscription } from "@/app/lib/push/repo";
import { eventToPush, type PushPayload } from "@/app/lib/push/payload";
import { type NotificationEvent } from "@/app/lib/notifications/service";
import { setPushCategoryMuted } from "@/app/lib/notifications/prefs";
import { sendToUser, dispatchPush } from "@/app/lib/push/service";

let h: Awaited<ReturnType<typeof createTestDb>>;

const U1 = "u1";
const ENDPOINT_A = "https://fcm.example/u1-device-a";
const ENDPOINT_B = "https://fcm.example/u1-device-b";

// A winning bet event for U1 — drives eventToPush({ title, body, url }).
const betWon: NotificationEvent = {
  type: "bet_won",
  userId: U1,
  marketId: "m1",
  betId: "b1",
  questionHe: "האם יתקיימו בחירות?",
  payout: 1234,
};

// market_resolved for the SAME user — dedupe must collapse this away in favor
// of the higher-priority bet_won.
const marketResolved: NotificationEvent = {
  type: "market_resolved",
  userId: U1,
  marketId: "m1",
  questionHe: "האם יתקיימו בחירות?",
};

/** Inserts a user row (the FK target) using the same shape repo.test.ts uses. */
async function seedUser(id: string) {
  await h.db.insert(users).values({ id, name: id, email: `${id}@x.co` });
}

async function seedTwoSubs() {
  await seedUser(U1);
  await upsertSubscription({
    db: h.db,
    userId: U1,
    endpoint: ENDPOINT_A,
    p256dh: "p256-a",
    auth: "auth-a",
  });
  await upsertSubscription({
    db: h.db,
    userId: U1,
    endpoint: ENDPOINT_B,
    p256dh: "p256-b",
    auth: "auth-b",
  });
}

beforeEach(async () => {
  h = await createTestDb();
  vi.mocked(webpush.sendNotification).mockReset();
  vi.mocked(webpush.sendNotification).mockResolvedValue(undefined as never);
  // Present VAPID env so the configured-ness gate passes by default.
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "pub-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await h.close();
});

test("dispatchPush fans a bet_won out to every device, with the exact payload JSON", async () => {
  await seedTwoSubs();

  await dispatchPush({ db: h.db, events: [betWon] });

  // One send per subscription (2 subs -> 2 calls).
  expect(webpush.sendNotification).toHaveBeenCalledTimes(2);

  // The 2nd arg of every call is JSON.stringify of the { title, body, url }
  // payload that eventToPush produces for the bet_won event.
  const expectedBody = JSON.stringify(eventToPush(betWon));
  for (const call of vi.mocked(webpush.sendNotification).mock.calls) {
    expect(call[1]).toBe(expectedBody);
  }

  // Sanity: the payload really is the { title, body, url } contract shape.
  const payload: PushPayload = eventToPush(betWon);
  expect(payload).toEqual({
    title: expect.any(String),
    body: expect.any(String),
    url: "/market/m1",
  });
});

test("a 410 Gone prunes that subscription row; a 500 keeps it", async () => {
  await seedTwoSubs();

  // ENDPOINT_A's send is Gone (410) -> prune; ENDPOINT_B is a 500 -> keep.
  vi.mocked(webpush.sendNotification).mockImplementation(
    async (sub: { endpoint: string }) => {
      if (sub.endpoint === ENDPOINT_A) {
        throw new MockWebPushError("gone", 410);
      }
      throw new MockWebPushError("boom", 500);
    },
  );

  await dispatchPush({ db: h.db, events: [betWon] });

  // Observable end-state: only the 500 endpoint survives; the 410 was pruned.
  const left = await listByUser({ db: h.db, userId: U1 });
  expect(left.length).toBe(1);
  expect(left[0].endpoint).toBe(ENDPOINT_B);
});

test("dedupe: a winner's [bet_won, market_resolved] yields one push per device, not two", async () => {
  await seedTwoSubs();

  await dispatchPush({ db: h.db, events: [betWon, marketResolved] });

  // 2 subs x 1 deduped event = 2 calls (NOT 4). And it's the bet_won payload.
  expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
  const expectedBody = JSON.stringify(eventToPush(betWon));
  for (const call of vi.mocked(webpush.sendNotification).mock.calls) {
    expect(call[1]).toBe(expectedBody);
  }
});

test("sendToUser is a no-op (skipped) when VAPID is not configured", async () => {
  await seedTwoSubs();
  vi.stubEnv("VAPID_PRIVATE_KEY", "");

  const result = await sendToUser({
    db: h.db,
    userId: U1,
    payload: eventToPush(betWon),
  });

  expect(result).toEqual({ sent: 0, skipped: true });
  expect(webpush.sendNotification).not.toHaveBeenCalled();
});

test("sendToUser counts successful sends across all of a user's devices", async () => {
  await seedTwoSubs();

  const result = await sendToUser({
    db: h.db,
    userId: U1,
    payload: eventToPush(betWon),
  });

  expect(result).toEqual({ sent: 2 });
  expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
});

test("dispatchPush skips a type the user muted, but still sends unmuted types", async () => {
  await seedTwoSubs();
  // U1 mutes the "outcomes" category → bet_won is in the muted set.
  await setPushCategoryMuted({ db: h.db, userId: U1, category: "outcomes", muted: true });

  await dispatchPush({ db: h.db, events: [betWon] });
  expect(webpush.sendNotification).not.toHaveBeenCalled(); // muted → no push

  // A type in a different (un-muted) category still fans out to both devices.
  const seasonReward: NotificationEvent = {
    type: "season_reward",
    userId: U1,
    tierId: "t1",
    seasonId: "s1",
    tierNameHe: "ברונזה",
    amount: 50,
  };
  await dispatchPush({ db: h.db, events: [seasonReward] });
  expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
});

test("dispatchPush short-circuits on an empty event list", async () => {
  await seedTwoSubs();

  await dispatchPush({ db: h.db, events: [] });

  expect(webpush.sendNotification).not.toHaveBeenCalled();
  // Rows untouched.
  const rows = await h.db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, U1));
  expect(rows.length).toBe(2);
});
