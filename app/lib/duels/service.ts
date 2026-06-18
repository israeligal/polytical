import { randomBytes } from "node:crypto";
import { db as defaultDb } from "@/app/lib/db";
import type { AppDb } from "@/app/lib/db-utils";
import { getMarketBundle } from "@/app/lib/markets/repo";
import { makePrediction } from "@/app/lib/markets/service";
import { MarketNotFoundError, NotDuelableMarketError } from "@/app/lib/errors";
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
