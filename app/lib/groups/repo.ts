import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { db as defaultDb } from "@/app/lib/db";
import type { Tx } from "@/app/lib/db";
import type { AppDb } from "@/app/lib/db-utils";
import * as schema from "@/app/lib/schema";
import { groups, groupMembers, users } from "@/app/lib/schema";
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
  name: string;
  handle: string | null;
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

/** Active roster (for the members list); newest-joined last. */
export async function listActiveMembers({ db = defaultDb, groupId }: { db?: AppDb; groupId: string }): Promise<GroupMemberView[]> {
  return db
    .select({
      userId: groupMembers.userId,
      name: users.name,
      handle: users.handle,
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
