import { randomBytes } from "node:crypto";
import { db as defaultDb } from "@/app/lib/db";
import type { AppDb } from "@/app/lib/db-utils";
import { getMarketBundle } from "@/app/lib/markets/repo";
import { makePrediction } from "@/app/lib/markets/service";
import { MarketClosedError, MarketNotFoundError, NotDuelableMarketError } from "@/app/lib/errors";
import { emitNotifications, type NotificationEvent } from "@/app/lib/notifications/service";
import { dispatchPush } from "@/app/lib/push/service";
import { logger } from "@/app/lib/logger";
import * as repo from "@/app/lib/duels/repo";

// 128 bits of url-safe randomness — collision is not a realistic concern, so no
// retry loop (unlike the groups slug, which is short + human-ish).
function generateToken(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Mints a single-bet duel over a GLOBAL market. Rejects a missing market and a
 * group motion (group motions are member-only and never shareable as an open
 * duel — keeps the groups sandbox intact). Returns the share token.
 */
export async function createChallenge({
  db = defaultDb,
  challengerUserId,
  marketId,
}: {
  db?: AppDb;
  challengerUserId: string;
  marketId: string;
}): Promise<{ token: string }> {
  const bundle = await getMarketBundle({ db, marketId });
  if (!bundle) throw new MarketNotFoundError();
  if (bundle.market.groupId) throw new NotDuelableMarketError();
  // Don't mint a duel over a market nobody can join — a closed/resolved market
  // would produce a dead share link (every join would fail makePrediction).
  if (bundle.market.status !== "open" || bundle.market.closeAt.getTime() <= Date.now())
    throw new MarketClosedError();
  const row = await repo.createChallenge({ db, token: generateToken(), challengerUserId, marketId });
  return { token: row.token };
}

/**
 * Accept a duel: the viewer's pick IS a normal prediction (open/outcome guards
 * live in makePrediction), plus an idempotent participant record. Two writes,
 * not one tx — makePrediction owns its tx; recordParticipant is idempotent, so a
 * mid-failure just leaves the pick recorded and a re-accept reconciles.
 */
export async function joinDuel({
  db = defaultDb,
  token,
  userId,
  outcomeId,
}: {
  db?: AppDb;
  token: string;
  userId: string;
  outcomeId: string;
}): Promise<void> {
  const challenge = await repo.getChallengeByToken({ db, token });
  if (!challenge) throw new MarketNotFoundError(); // bad / removed link
  await makePrediction({ db, userId, marketId: challenge.marketId, outcomeId });
  await repo.recordParticipant({ db, challengeId: challenge.id, userId });
}

/** A participant's head-to-head result vs the challenger on a single market. */
export function duelResult(playerCorrect: boolean, challengerCorrect: boolean): "won" | "lost" | "tie" {
  if (playerCorrect && !challengerCorrect) return "won";
  if (!playerCorrect && challengerCorrect) return "lost";
  return "tie";
}

/**
 * Post-resolve settlement notice for every duel on a market: tells each player
 * the head-to-head outcome (challenger framed vs the field). Deliberately a
 * SEPARATE, best-effort pass — it is NOT part of the P0 `resolveMarket`
 * transaction (decoupled; a failure here can never break settlement). Callers
 * invoke it after `resolveMarket` returns.
 */
export async function notifyDuelSettlements({
  db = defaultDb,
  marketId,
  winningOutcomeId,
}: {
  db?: AppDb;
  marketId: string;
  winningOutcomeId: string;
}): Promise<void> {
  const list = await repo.getChallengesForMarket({ db, marketId });
  if (list.length === 0) return;
  const bundle = await getMarketBundle({ db, marketId });
  const questionHe = bundle?.market.questionHe ?? "דו-קרב";

  const events: NotificationEvent[] = [];
  for (const c of list) {
    const view = await repo.getChallengeByToken({ db, token: c.token });
    const challengerCorrect = view?.challengerOutcomeId === winningOutcomeId;
    // Challenger is vs the whole field → framed by their own correctness.
    events.push({
      type: "duel_settled",
      userId: c.challengerUserId,
      challengeId: c.id,
      questionHe,
      result: challengerCorrect ? "won" : "lost",
    });
    const participants = await repo.getParticipants({ db, challengeId: c.id, marketId });
    for (const p of participants) {
      events.push({
        type: "duel_settled",
        userId: p.userId,
        challengeId: c.id,
        questionHe,
        result: duelResult(p.outcomeId === winningOutcomeId, challengerCorrect),
      });
    }
  }
  if (events.length === 0) return;
  // The in-app rows are the durable record; push is best-effort (never let a
  // push/VAPID hiccup lose the notifications).
  await db.transaction(async (tx) => emitNotifications({ tx, events }));
  try {
    await dispatchPush({ db, events });
  } catch (e) {
    logger.error("duel.settlement_push_failed", { marketId, err: String(e) });
  }
}
