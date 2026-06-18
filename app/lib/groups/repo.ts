import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db as defaultDb } from "@/app/lib/db";
import type { Tx } from "@/app/lib/db";
import type { AppDb } from "@/app/lib/db-utils";
import * as schema from "@/app/lib/schema";
import { groups, groupMembers, users, markets, bets, outcomes } from "@/app/lib/schema";
import type { MarketRow } from "@/app/lib/markets/repo";
import { requireUserId } from "@/app/lib/errors";

// Repository for the groups domain. Owns all Drizzle access; driver-agnostic
// (postgres-js in prod, PGlite in tests). Mutators that must ride a caller's
// transaction take `tx?` and fall back to `db`. requireUserId guards every
// user-scoped read/write.

export type GroupRow = typeof groups.$inferSelect;
export type GroupMemberRow = typeof groupMembers.$inferSelect;
export type GroupRole = (typeof schema.groupMemberRole.enumValues)[number];

/** A group in the header switcher / "my groups" list — with the viewer's role. */
export interface MyGroup {
  id: string;
  slug: string;
  nameHe: string;
  emblem: string | null;
  colorToken: string | null;
  role: GroupRole;
}

/** A roster row: the member's identity + their sandboxed group record. */
export interface GroupMemberView {
  userId: string;
  handle: string | null;
  caricatureUrl: string | null;
  role: GroupRole;
  groupWins: number;
  groupResolved: number;
  joinedAt: Date;
}

// --- id/slug/code generation (node:crypto; nanoid is not a dependency) ---

/** Short opaque url-safe slug for /g/[slug] (base64url, ~8 chars). */
export function generateSlug(): string {
  return randomBytes(6).toString("base64url");
}

/** Longer shareable join secret for /g/join/[code]. */
export function generateInviteCode(): string {
  return randomBytes(12).toString("base64url");
}

// --- reads ---

export async function getGroupById({ db = defaultDb, id }: { db?: AppDb; id: string }): Promise<GroupRow | null> {
  const [row] = await db.select().from(groups).where(eq(groups.id, id));
  return row ?? null;
}

export async function getGroupBySlug({ db = defaultDb, slug }: { db?: AppDb; slug: string }): Promise<GroupRow | null> {
  const [row] = await db.select().from(groups).where(eq(groups.slug, slug));
  return row ?? null;
}

export async function getGroupByInviteCode({
  db = defaultDb,
  inviteCode,
}: {
  db?: AppDb;
  inviteCode: string;
}): Promise<GroupRow | null> {
  const [row] = await db.select().from(groups).where(eq(groups.inviteCode, inviteCode));
  return row ?? null;
}

export async function slugExists({ db = defaultDb, slug }: { db?: AppDb; slug: string }): Promise<boolean> {
  const [row] = await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, slug));
  return !!row;
}

export async function inviteCodeExists({ db = defaultDb, inviteCode }: { db?: AppDb; inviteCode: string }): Promise<boolean> {
  const [row] = await db.select({ id: groups.id }).from(groups).where(eq(groups.inviteCode, inviteCode));
  return !!row;
}

/** The viewer's membership row in a group (any status), or null. */
export async function getMembership({
  db = defaultDb,
  groupId,
  userId,
}: {
  db?: AppDb;
  groupId: string;
  userId: string;
}): Promise<GroupMemberRow | null> {
  const [row] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, requireUserId(userId))));
  return row ?? null;
}

/** Active members of a group whose handle is in `handles` — resolves @-mentions
 *  to fellow members only (you can't mention a non-member into a group thread). */
export async function getActiveMembersByHandles({
  db = defaultDb,
  groupId,
  handles,
}: {
  db?: AppDb;
  groupId: string;
  handles: string[];
}): Promise<{ userId: string; handle: string }[]> {
  if (handles.length === 0) return [];
  const rows = await db
    .select({ userId: users.id, handle: users.handle })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active"), inArray(users.handle, handles)));
  return rows.filter((r): r is { userId: string; handle: string } => r.handle != null);
}

/** Active roster (for the members list); newest-joined last. */
export async function listActiveMembers({ db = defaultDb, groupId }: { db?: AppDb; groupId: string }): Promise<GroupMemberView[]> {
  return db
    .select({
      userId: groupMembers.userId,
      handle: users.handle,
      caricatureUrl: users.caricatureUrl,
      role: groupMembers.role,
      groupWins: groupMembers.groupWins,
      groupResolved: groupMembers.groupResolved,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")))
    .orderBy(asc(groupMembers.joinedAt));
}

/** The viewer's active groups, for the switcher / "my groups" page. */
export async function listMyGroups({ db = defaultDb, userId }: { db?: AppDb; userId: string }): Promise<MyGroup[]> {
  return db
    .select({
      id: groups.id,
      slug: groups.slug,
      nameHe: groups.nameHe,
      emblem: groups.emblem,
      colorToken: groups.colorToken,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, requireUserId(userId)), eq(groupMembers.status, "active")))
    .orderBy(desc(groupMembers.joinedAt));
}

export async function countOwnedGroups({ db = defaultDb, userId }: { db?: AppDb; userId: string }): Promise<number> {
  const [row] = await db.select({ n: count() }).from(groups).where(eq(groups.ownerId, requireUserId(userId)));
  return row?.n ?? 0;
}

export async function countActiveMemberships({ db = defaultDb, userId }: { db?: AppDb; userId: string }): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, requireUserId(userId)), eq(groupMembers.status, "active")));
  return row?.n ?? 0;
}

export async function countActiveMembers({ db = defaultDb, groupId }: { db?: AppDb; groupId: string }): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")));
  return row?.n ?? 0;
}

/** How many motions `userId` posted in `groupId` since `since` — the per-(user,
 *  group) daily-cap counter (DB-authoritative; the in-memory limiter only
 *  guards bursts). */
export async function countGroupMotionsSince({
  db = defaultDb,
  groupId,
  userId,
  since,
}: {
  db?: AppDb;
  groupId: string;
  userId: string;
  since: Date;
}): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(markets)
    // gte (not a raw sql`>= ${since}`) so the Date binds correctly on postgres-js
    // (prod) as well as PGLite — mirrors suggestions.countSuggestionsSince.
    .where(and(eq(markets.groupId, groupId), eq(markets.createdBy, requireUserId(userId)), gte(markets.createdAt, since)));
  return row?.n ?? 0;
}

// --- mutators (tx-aware) ---

/** Inserts the group row. Use inside the createGroup tx. */
export async function insertGroup({
  tx,
  db = defaultDb,
  slug,
  nameHe,
  descriptionHe,
  emblem,
  colorToken,
  ownerId,
  inviteCode,
}: {
  tx?: Tx;
  db?: AppDb;
  slug: string;
  nameHe: string;
  descriptionHe?: string | null;
  emblem?: string | null;
  colorToken?: string | null;
  ownerId: string;
  inviteCode: string;
}): Promise<GroupRow> {
  const exec = tx ?? db;
  const [row] = await exec
    .insert(groups)
    .values({
      slug,
      nameHe,
      descriptionHe: descriptionHe ?? null,
      emblem: emblem ?? null,
      colorToken: colorToken ?? null,
      ownerId: requireUserId(ownerId),
      inviteCode,
    })
    .returning();
  return row;
}

/**
 * Adds a member, or reactivates a `left` row (rejoin restores the frozen
 * counters since the row is preserved). Idempotent: an already-active member is
 * left untouched. Returns the resulting role/status.
 */
export async function addOrReactivateMember({
  tx,
  db = defaultDb,
  groupId,
  userId,
  role = "member",
}: {
  tx?: Tx;
  db?: AppDb;
  groupId: string;
  userId: string;
  role?: GroupRole;
}): Promise<void> {
  const exec = tx ?? db;
  await exec
    .insert(groupMembers)
    .values({ groupId, userId: requireUserId(userId), role, status: "active" })
    .onConflictDoUpdate({
      target: [groupMembers.groupId, groupMembers.userId],
      // Re-activate a previously-left member; never downgrade an existing role
      // or wipe their frozen counters (only status flips).
      set: { status: "active" },
    });
}

export async function setMemberStatus({
  tx,
  db = defaultDb,
  groupId,
  userId,
  status,
}: {
  tx?: Tx;
  db?: AppDb;
  groupId: string;
  userId: string;
  status: "active" | "left";
}): Promise<void> {
  const exec = tx ?? db;
  await exec
    .update(groupMembers)
    .set({ status })
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, requireUserId(userId))));
}

export async function setMemberRole({
  tx,
  db = defaultDb,
  groupId,
  userId,
  role,
}: {
  tx?: Tx;
  db?: AppDb;
  groupId: string;
  userId: string;
  role: GroupRole;
}): Promise<void> {
  const exec = tx ?? db;
  await exec
    .update(groupMembers)
    .set({ role })
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, requireUserId(userId))));
}

export async function setGroupOwner({
  tx,
  db = defaultDb,
  groupId,
  ownerId,
}: {
  tx?: Tx;
  db?: AppDb;
  groupId: string;
  ownerId: string;
}): Promise<void> {
  const exec = tx ?? db;
  await exec.update(groups).set({ ownerId: requireUserId(ownerId) }).where(eq(groups.id, groupId));
}

export async function deleteGroup({ tx, db = defaultDb, groupId }: { tx?: Tx; db?: AppDb; groupId: string }): Promise<void> {
  const exec = tx ?? db;
  await exec.delete(groups).where(eq(groups.id, groupId));
}

export async function rotateInviteCode({
  db = defaultDb,
  groupId,
  inviteCode,
}: {
  db?: AppDb;
  groupId: string;
  inviteCode: string;
}): Promise<void> {
  await db.update(groups).set({ inviteCode }).where(eq(groups.id, groupId));
}

/** The first active admin (then member), longest-tenured first — the heir when
 *  an owner leaves. Excludes `excludeUserId` (the departing owner). */
export async function findSuccessor({
  tx,
  db = defaultDb,
  groupId,
  excludeUserId,
}: {
  tx?: Tx;
  db?: AppDb;
  groupId: string;
  excludeUserId: string;
}): Promise<{ userId: string; role: GroupRole } | null> {
  const exec = tx ?? db;
  const rows = await exec
    .select({ userId: groupMembers.userId, role: groupMembers.role, joinedAt: groupMembers.joinedAt })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")))
    .orderBy(asc(groupMembers.joinedAt));
  const others = rows.filter((r) => r.userId !== excludeUserId);
  if (others.length === 0) return null;
  const admin = others.find((r) => r.role === "admin");
  const heir = admin ?? others[0];
  return { userId: heir.userId, role: heir.role };
}

// --- group motions: scoreboard, feed, reveal-gated picks, sandboxed stat bump ---

/** A ranked scoreboard line — the member's SANDBOXED group record. */
export interface GroupScoreEntry {
  rank: number;
  userId: string;
  handle: string | null;
  caricatureUrl: string | null;
  groupWins: number;
  groupResolved: number;
  accuracy: number; // 0–100, over group motions only
}

// Accuracy over the sandboxed group counters (mirrors leaderboard's accuracyExpr
// but on group_members, not users).
const groupAccuracyExpr = sql<number>`(
  CASE WHEN ${groupMembers.groupResolved} > 0
    THEN round(${groupMembers.groupWins} * 100.0 / ${groupMembers.groupResolved})
    ELSE 0
  END
)::int`;

/** The group scoreboard: active members ranked by group wins → accuracy →
 *  tenure. Ranks ONLY this group's motions (sandboxed counters). */
export async function getGroupScoreboard({ db = defaultDb, groupId }: { db?: AppDb; groupId: string }): Promise<GroupScoreEntry[]> {
  const rows = await db
    .select({
      userId: groupMembers.userId,
      handle: users.handle,
      caricatureUrl: users.caricatureUrl,
      groupWins: groupMembers.groupWins,
      groupResolved: groupMembers.groupResolved,
      accuracy: groupAccuracyExpr,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")))
    .orderBy(
      desc(groupMembers.groupWins),
      desc(groupAccuracyExpr),
      asc(groupMembers.joinedAt),
    );
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

/** This group's motions (markets carrying this groupId), newest first. */
export async function listGroupMarkets({
  db = defaultDb,
  groupId,
  status,
}: {
  db?: AppDb;
  groupId: string;
  status?: (typeof schema.marketStatus.enumValues)[number];
}): Promise<MarketRow[]> {
  const where = status
    ? and(eq(markets.groupId, groupId), eq(markets.status, status))
    : eq(markets.groupId, groupId);
  return db.select().from(markets).where(where).orderBy(desc(markets.createdAt));
}

export interface GroupPick {
  userId: string;
  handle: string | null;
  outcomeId: string;
  outcomeLabelHe: string;
}
export interface GroupMotionPicks {
  /** Whether the viewer may see others' picks yet (they predicted, or it closed). */
  revealed: boolean;
  picks: GroupPick[];
}

/**
 * Members' picks on a group motion — reveal-gated. A viewer sees others' picks
 * only AFTER they have locked their own pick, or once the motion is no longer
 * open (closed/resolved/voided, or past closeAt). Until then `revealed` is false
 * and `picks` is empty (prevents copy-the-leader).
 */
export async function getGroupMotionPicks({
  db = defaultDb,
  marketId,
  viewerId,
}: {
  db?: AppDb;
  marketId: string;
  viewerId: string;
}): Promise<GroupMotionPicks> {
  const [market] = await db.select().from(markets).where(eq(markets.id, marketId));
  if (!market) return { revealed: false, picks: [] };

  const [own] = await db
    .select({ id: bets.id })
    .from(bets)
    .where(and(eq(bets.marketId, marketId), eq(bets.userId, requireUserId(viewerId))));
  const closed = market.status !== "open" || market.closeAt.getTime() <= Date.now();
  const revealed = Boolean(own) || closed;
  const groupId = market.groupId;
  if (!revealed || !groupId) return { revealed, picks: [] };

  // Only ACTIVE members' picks are revealed — a departed member's bet row
  // survives, but their identity + pick must not leak into "מי ניבא מה".
  const picks = await db
    .select({
      userId: bets.userId,
      handle: users.handle,
      outcomeId: bets.outcomeId,
      outcomeLabelHe: outcomes.labelHe,
    })
    .from(bets)
    .innerJoin(users, eq(users.id, bets.userId))
    .innerJoin(outcomes, eq(outcomes.id, bets.outcomeId))
    .innerJoin(groupMembers, and(eq(groupMembers.userId, bets.userId), eq(groupMembers.groupId, groupId)))
    .where(and(eq(bets.marketId, marketId), eq(groupMembers.status, "active")));
  return { revealed: true, picks };
}

/** Sandboxed stat bump for a group motion resolve: +1 resolved, +1 win if
 *  correct — on group_members only (NEVER users.totalWins). Rides the resolve tx. */
export async function bumpGroupStats({
  tx,
  db = defaultDb,
  groupId,
  userId,
  correct,
}: {
  tx?: Tx;
  db?: AppDb;
  groupId: string;
  userId: string;
  correct: boolean;
}): Promise<void> {
  const exec = tx ?? db;
  await exec
    .update(groupMembers)
    .set({
      groupResolved: sql`${groupMembers.groupResolved} + 1`,
      groupWins: sql`${groupMembers.groupWins} + ${correct ? 1 : 0}`,
    })
    // Active members only: a predictor who has LEFT keeps their counters frozen
    // (their bet row survives, but their record must not move after departure).
    .where(and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, requireUserId(userId)),
      eq(groupMembers.status, "active"),
    ));
}

/** Clears a user's home group IF it points at `groupId` (called on leave/remove
 *  so a departed member's bare-home redirect doesn't 404 on a group they left).
 *  The FK's onDelete:set null only covers group DELETION, not an ordinary leave. */
export async function clearDefaultGroupIfMatches({
  tx,
  db = defaultDb,
  userId,
  groupId,
}: {
  tx?: Tx;
  db?: AppDb;
  userId: string;
  groupId: string;
}): Promise<void> {
  const exec = tx ?? db;
  await exec
    .update(users)
    .set({ defaultGroupId: null })
    .where(and(eq(users.id, requireUserId(userId)), eq(users.defaultGroupId, groupId)));
}

/** Sets the user's home group ONLY if they have none yet (auto-home on first
 *  group). Never overrides an explicit later choice. Returns rows updated. */
export async function setDefaultGroupIfUnset({
  tx,
  db = defaultDb,
  userId,
  groupId,
}: {
  tx?: Tx;
  db?: AppDb;
  userId: string;
  groupId: string;
}): Promise<{ updated: number }> {
  const exec = tx ?? db;
  const rows = await exec
    .update(users)
    .set({ defaultGroupId: groupId })
    .where(and(eq(users.id, requireUserId(userId)), isNull(users.defaultGroupId)))
    .returning({ id: users.id });
  return { updated: rows.length };
}
