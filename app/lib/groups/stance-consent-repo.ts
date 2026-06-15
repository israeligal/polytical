import { and, count, eq } from "drizzle-orm";
import { db as defaultDb } from "@/app/lib/db";
import type { Tx } from "@/app/lib/db";
import type { AppDb } from "@/app/lib/db-utils";
import { groupMembers, groupStanceConsent, userStances, users } from "@/app/lib/schema";
import { requireUserId } from "@/app/lib/errors";

// Phase 2 stance-sharing repo. The ONLY place a member's Knesset-vote stance
// direction is read for ANOTHER user — and only behind the 4-way gate in
// getGroupVoteStances. Presence in group_stance_consent = opted-in.

export type GroupStance = (typeof userStances.$inferSelect)["stance"]; // "for" | "against"

/** A revealed stance row inside a consenting group. */
export interface GroupVoteStance {
  userId: string;
  handle: string | null;
  stance: GroupStance;
}

async function isActiveMember(db: AppDb, groupId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ s: groupMembers.status })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, requireUserId(userId))));
  return row?.s === "active";
}

async function hasConsent(db: AppDb, groupId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ u: groupStanceConsent.userId })
    .from(groupStanceConsent)
    .where(and(eq(groupStanceConsent.groupId, groupId), eq(groupStanceConsent.userId, requireUserId(userId))));
  return !!row;
}

/** Whether the viewer is currently sharing their stances in this group. */
export async function getConsent({ db = defaultDb, groupId, userId }: { db?: AppDb; groupId: string; userId: string }): Promise<boolean> {
  return hasConsent(db, groupId, userId);
}

/** Opt in (idempotent). */
export async function setConsent({
  tx,
  db = defaultDb,
  groupId,
  userId,
}: {
  tx?: Tx;
  db?: AppDb;
  groupId: string;
  userId: string;
}): Promise<void> {
  const exec = tx ?? db;
  await exec
    .insert(groupStanceConsent)
    .values({ groupId, userId: requireUserId(userId) })
    .onConflictDoNothing({ target: [groupStanceConsent.groupId, groupStanceConsent.userId] });
}

/** Opt out — hides the member's past directions from the group immediately. */
export async function clearConsent({
  tx,
  db = defaultDb,
  groupId,
  userId,
}: {
  tx?: Tx;
  db?: AppDb;
  groupId: string;
  userId: string;
}): Promise<void> {
  const exec = tx ?? db;
  await exec
    .delete(groupStanceConsent)
    .where(and(eq(groupStanceConsent.groupId, groupId), eq(groupStanceConsent.userId, requireUserId(userId))));
}

/** "X of Y": consenting active members / total active members (denominator for
 *  the share view, to flag the selection effect). */
export async function getShareStats({ db = defaultDb, groupId }: { db?: AppDb; groupId: string }): Promise<{ sharing: number; total: number }> {
  const [total] = await db
    .select({ n: count() })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")));
  const [sharing] = await db
    .select({ n: count() })
    .from(groupStanceConsent)
    .innerJoin(
      groupMembers,
      and(eq(groupMembers.groupId, groupStanceConsent.groupId), eq(groupMembers.userId, groupStanceConsent.userId), eq(groupMembers.status, "active")),
    )
    .where(eq(groupStanceConsent.groupId, groupId));
  return { sharing: sharing?.n ?? 0, total: total?.n ?? 0 };
}

/**
 * THE gated reveal. Returns each consenting + active member's stance on `voteId`
 * — but ONLY when the VIEWER is (a) an active member of the group AND (b) has
 * consented themselves. Any gate failure returns `[]` (never an error, which
 * could carry a direction in a Drizzle message). The k-anonymity floor is
 * deliberately NOT applied here — every row belongs to a consenting member of a
 * private group, viewed by a consenting fellow member. Mirrors getGroupMotionPicks.
 */
export async function getGroupVoteStances({
  db = defaultDb,
  groupId,
  voteId,
  viewerId,
}: {
  db?: AppDb;
  groupId: string;
  voteId: number;
  viewerId: string;
}): Promise<GroupVoteStance[]> {
  if (!(await isActiveMember(db, groupId, viewerId))) return [];
  if (!(await hasConsent(db, groupId, viewerId))) return [];
  return db
    .select({ userId: userStances.userId, handle: users.handle, stance: userStances.stance })
    .from(userStances)
    .innerJoin(
      groupStanceConsent,
      and(eq(groupStanceConsent.userId, userStances.userId), eq(groupStanceConsent.groupId, groupId)),
    )
    .innerJoin(
      groupMembers,
      and(eq(groupMembers.userId, userStances.userId), eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")),
    )
    .innerJoin(users, eq(users.id, userStances.userId))
    .where(eq(userStances.voteId, voteId));
}
