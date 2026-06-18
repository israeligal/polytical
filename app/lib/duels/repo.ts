import { and, count, eq, ne, sql } from "drizzle-orm";
import { db as defaultDb, type Tx } from "@/app/lib/db";
import type { AppDb } from "@/app/lib/db-utils";
import { challenges, challengeParticipants, users, bets } from "@/app/lib/schema";
import { requireUserId } from "@/app/lib/errors";
import { FALLBACK_HANDLE } from "@/app/lib/onboarding/handle";

// Repository for the duels domain. Owns all Drizzle access; driver-agnostic
// (postgres-js in prod, PGlite in tests). Mutators that must ride a caller's
// transaction take `tx?` and fall back to `db`. `requireUserId` guards
// user-scoped writes; `getChallengeByToken` is a PUBLIC token-scoped read (the
// share landing) — it returns only public fields (@handle, never users.name).

export type ChallengeRow = typeof challenges.$inferSelect;

/** A challenge resolved for the public arena: market + challenger identity + their live pick. */
export interface ChallengeView {
  id: string;
  token: string;
  marketId: string;
  challengerUserId: string;
  challengerHandle: string;
  challengerOutcomeId: string | null;
}

/** A participant in the standings: public @handle + their current pick (live until close). */
export interface DuelParticipant {
  userId: string;
  handle: string;
  outcomeId: string | null;
}

export async function createChallenge({
  db = defaultDb,
  tx,
  token,
  challengerUserId,
  marketId,
}: {
  db?: AppDb;
  tx?: Tx;
  token: string;
  challengerUserId: string;
  marketId: string;
}): Promise<ChallengeRow> {
  const exec = tx ?? db;
  const [row] = await exec
    .insert(challenges)
    .values({ token, challengerUserId: requireUserId(challengerUserId), marketId })
    .returning();
  return row;
}

/** Public read for `/duel/[token]` — joins the challenger's @handle + their current pick. */
export async function getChallengeByToken({
  db = defaultDb,
  token,
}: {
  db?: AppDb;
  token: string;
}): Promise<ChallengeView | null> {
  const [row] = await db
    .select({
      id: challenges.id,
      token: challenges.token,
      marketId: challenges.marketId,
      challengerUserId: challenges.challengerUserId,
      challengerHandle: sql<string>`coalesce(${users.handle}, ${FALLBACK_HANDLE})`,
      challengerOutcomeId: bets.outcomeId,
    })
    .from(challenges)
    .innerJoin(users, eq(users.id, challenges.challengerUserId))
    .leftJoin(bets, and(eq(bets.userId, challenges.challengerUserId), eq(bets.marketId, challenges.marketId)))
    .where(eq(challenges.token, token));
  return row ? { ...row, challengerOutcomeId: row.challengerOutcomeId ?? null } : null;
}

/** Records a participant (the accept). Idempotent on (challengeId, userId). */
export async function recordParticipant({
  db = defaultDb,
  tx,
  challengeId,
  userId,
}: {
  db?: AppDb;
  tx?: Tx;
  challengeId: string;
  userId: string;
}): Promise<void> {
  const exec = tx ?? db;
  await exec
    .insert(challengeParticipants)
    .values({ challengeId, userId: requireUserId(userId) })
    .onConflictDoNothing();
}

/** Participants of a challenge with their current picks — the standings source. */
export async function getParticipants({
  db = defaultDb,
  challengeId,
  marketId,
}: {
  db?: AppDb;
  challengeId: string;
  marketId: string;
}): Promise<DuelParticipant[]> {
  const rows = await db
    .select({
      userId: challengeParticipants.userId,
      handle: sql<string>`coalesce(${users.handle}, ${FALLBACK_HANDLE})`,
      outcomeId: bets.outcomeId,
    })
    .from(challengeParticipants)
    .innerJoin(challenges, eq(challenges.id, challengeParticipants.challengeId))
    .innerJoin(users, eq(users.id, challengeParticipants.userId))
    .leftJoin(bets, and(eq(bets.userId, challengeParticipants.userId), eq(bets.marketId, marketId)))
    // Exclude the challenger — they're the challenger side, never a "participant"
    // (defends against any stale self-join row; the standings list adds them once).
    .where(and(eq(challengeParticipants.challengeId, challengeId), ne(challengeParticipants.userId, challenges.challengerUserId)));
  return rows.map((r) => ({ ...r, outcomeId: r.outcomeId ?? null }));
}

export async function getParticipantCount({
  db = defaultDb,
  challengeId,
}: {
  db?: AppDb;
  challengeId: string;
}): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(challengeParticipants)
    .where(eq(challengeParticipants.challengeId, challengeId));
  return row?.n ?? 0;
}

/** Every challenge fought over a market — used by the post-resolve settlement pass. */
export async function getChallengesForMarket({
  db = defaultDb,
  marketId,
}: {
  db?: AppDb;
  marketId: string;
}): Promise<{ id: string; token: string; challengerUserId: string; challengerOutcomeId: string | null }[]> {
  // Fold in the challenger's current pick (leftJoin) so the settlement pass
  // doesn't re-query per challenge.
  const rows = await db
    .select({
      id: challenges.id,
      token: challenges.token,
      challengerUserId: challenges.challengerUserId,
      challengerOutcomeId: bets.outcomeId,
    })
    .from(challenges)
    .leftJoin(bets, and(eq(bets.userId, challenges.challengerUserId), eq(bets.marketId, challenges.marketId)))
    .where(eq(challenges.marketId, marketId));
  return rows.map((r) => ({ ...r, challengerOutcomeId: r.challengerOutcomeId ?? null }));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve a challenge id → its share token (for the /duel/by-id/[id] redirect).
 *  Guards malformed ids so a bad link 404s instead of throwing an invalid-uuid error. */
export async function getChallengeTokenById({
  db = defaultDb,
  challengeId,
}: {
  db?: AppDb;
  challengeId: string;
}): Promise<string | null> {
  if (!UUID_RE.test(challengeId)) return null;
  const [row] = await db.select({ token: challenges.token }).from(challenges).where(eq(challenges.id, challengeId));
  return row?.token ?? null;
}
