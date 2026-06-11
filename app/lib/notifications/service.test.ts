import { beforeEach, afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, markets, outcomes, notifications } from "@/app/lib/schema";
import { makePrediction, resolveMarket } from "@/app/lib/markets/service";
import {
  emitNotifications,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "./service";
import { NotificationNotFoundError } from "@/app/lib/errors";

let h: Awaited<ReturnType<typeof createTestDb>>;
let marketId: string;
let yesId: string;
let noId: string;

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: "winner", name: "מנצח", email: "w@x.co" },
    { id: "loser", name: "מפסיד", email: "l@x.co" },
  ]);
  const [m] = await h.db
    .insert(markets)
    .values({ questionHe: "האם זה יקרה?", category: "coalition", closeAt: new Date(Date.now() + 7 * 864e5) })
    .returning({ id: markets.id });
  marketId = m.id;
  const outs = await h.db
    .insert(outcomes)
    .values([{ marketId, labelHe: "כן", ordinal: 0 }, { marketId, labelHe: "לא", ordinal: 1 }])
    .returning({ id: outcomes.id });
  yesId = outs[0].id;
  noId = outs[1].id;
});
afterEach(async () => h.close());

test("emitNotifications rolls back with a throwing transaction (atomic)", async () => {
  await expect(
    h.db.transaction(async (tx) => {
      await emitNotifications({
        tx,
        events: [{ type: "market_resolved", userId: "winner", marketId, questionHe: "x" }],
      });
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect((await h.db.select().from(notifications)).length).toBe(0);
});

test("resolveMarket emits bet_won for the correct predictor + market_resolved per participant", async () => {
  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: yesId });
  await makePrediction({ db: h.db, userId: "loser", marketId, outcomeId: noId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  const winnerNotifs = await listNotifications({ db: h.db, userId: "winner" });
  const loserNotifs = await listNotifications({ db: h.db, userId: "loser" });

  expect(winnerNotifs.filter((n) => n.type === "bet_won").length).toBe(1);
  expect(winnerNotifs.filter((n) => n.type === "market_resolved").length).toBe(1);
  // The loser gets the neutral "resolved" notice but NO win notice.
  expect(loserNotifs.filter((n) => n.type === "bet_won").length).toBe(0);
  expect(loserNotifs.filter((n) => n.type === "market_resolved").length).toBe(1);

  const won = winnerNotifs.find((n) => n.type === "bet_won");
  expect(won?.refMarketId).toBe(marketId);
  // New copy: no coins — just accuracy confirmation.
  expect(won?.titleHe).toBe("ניחשת נכון! 🎯");
  expect(won?.bodyHe).toContain("צדקת בניחוש");
});

test("getUnreadCount + markNotificationRead are scope-guarded", async () => {
  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: yesId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  expect(await getUnreadCount({ db: h.db, userId: "winner" })).toBeGreaterThan(0);

  const [n] = await listNotifications({ db: h.db, userId: "winner" });
  // A different user cannot mark someone else's notification read.
  await expect(markNotificationRead({ db: h.db, userId: "loser", id: n.id })).rejects.toBeInstanceOf(
    NotificationNotFoundError,
  );
  await markNotificationRead({ db: h.db, userId: "winner", id: n.id });
  const [after] = await h.db.select().from(notifications).where(eq(notifications.id, n.id));
  expect(after.read).toBe(true);

  const { count } = await markAllNotificationsRead({ db: h.db, userId: "winner" });
  expect(count).toBeGreaterThanOrEqual(0);
  expect(await getUnreadCount({ db: h.db, userId: "winner" })).toBe(0);
});
