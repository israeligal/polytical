import { db as defaultDb } from "@/app/lib/db";
import type { AppDb } from "@/app/lib/db-utils";
import * as repo from "@/app/lib/groups/repo";
import type { GroupRow, GroupMemberRow } from "@/app/lib/groups/repo";
import { createGroupSchema, type CreateGroupInput } from "@/app/lib/groups/schemas";
import { emitNotifications, type NotificationEvent } from "@/app/lib/notifications/service";
import { dispatchPush } from "@/app/lib/push/service";
import { logger } from "@/app/lib/logger";
import {
  GroupNotFoundError,
  NotGroupMemberError,
  InsufficientGroupRoleError,
  InvalidInviteCodeError,
  GroupCapError,
  GroupNameError,
} from "@/app/lib/errors";

// Groups service — orchestration + validation + soft caps + role checks.
// Route→Action→Service→Repo; repos own DB access. A group is a self-contained
// arena; its motions/scoreboard are sandboxed (see markets + groups/motions).

/** Soft caps (tune freely). Throw GroupCapError when exceeded. */
export const MAX_GROUPS_OWNED = 10;
export const MAX_GROUPS_JOINED = 50;
export const MAX_GROUP_MEMBERS = 200;

const SLUG_ATTEMPTS = 6;

async function uniqueSlug(db: AppDb): Promise<string> {
  for (let i = 0; i < SLUG_ATTEMPTS; i++) {
    const slug = repo.generateSlug();
    if (!(await repo.slugExists({ db, slug }))) return slug;
  }
  // 8-char base64url collisions 6× running is effectively impossible; if it ever
  // happens, surface it (the unique constraint is the ultimate backstop).
  throw new Error("could not generate a unique group slug");
}

async function uniqueInviteCode(db: AppDb): Promise<string> {
  for (let i = 0; i < SLUG_ATTEMPTS; i++) {
    const inviteCode = repo.generateInviteCode();
    if (!(await repo.inviteCodeExists({ db, inviteCode }))) return inviteCode;
  }
  throw new Error("could not generate a unique invite code");
}

/**
 * Creates a group: the caller becomes its owner (one tx: group + owner member),
 * and it auto-becomes their home group if they have none yet. Soft caps apply.
 */
export async function createGroup({
  db = defaultDb,
  userId,
  input,
}: {
  db?: AppDb;
  userId: string;
  input: CreateGroupInput;
}): Promise<GroupRow> {
  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) throw new GroupNameError();
  const { nameHe, descriptionHe, emblem, colorToken } = parsed.data;

  if ((await repo.countOwnedGroups({ db, userId })) >= MAX_GROUPS_OWNED) throw new GroupCapError();
  if ((await repo.countActiveMemberships({ db, userId })) >= MAX_GROUPS_JOINED) throw new GroupCapError();

  const slug = await uniqueSlug(db);
  const inviteCode = await uniqueInviteCode(db);

  return db.transaction(async (tx) => {
    const group = await repo.insertGroup({
      tx, slug, nameHe, descriptionHe, emblem, colorToken, ownerId: userId, inviteCode,
    });
    await repo.addOrReactivateMember({ tx, groupId: group.id, userId, role: "owner" });
    await repo.setDefaultGroupIfUnset({ tx, userId, groupId: group.id });
    return group;
  });
}

/**
 * Joins a group via its invite code. Idempotent: an already-active member is a
 * no-op (returns the group). Reactivates a previously-left member (restoring
 * their frozen counters). Auto-homes the user if it's their first group. Caps apply.
 */
export async function joinGroup({
  db = defaultDb,
  userId,
  inviteCode,
}: {
  db?: AppDb;
  userId: string;
  inviteCode: string;
}): Promise<GroupRow> {
  const group = await repo.getGroupByInviteCode({ db, inviteCode });
  if (!group) throw new InvalidInviteCodeError();

  const existing = await repo.getMembership({ db, groupId: group.id, userId });
  if (existing?.status === "active") return group; // idempotent

  // Caps only apply to a genuinely new/returning active membership.
  if ((await repo.countActiveMemberships({ db, userId })) >= MAX_GROUPS_JOINED) throw new GroupCapError();
  if ((await repo.countActiveMembers({ db, groupId: group.id })) >= MAX_GROUP_MEMBERS) throw new GroupCapError();

  let dispatched: NotificationEvent[] = [];
  await db.transaction(async (tx) => {
    await repo.addOrReactivateMember({ tx, groupId: group.id, userId, role: "member" });
    await repo.setDefaultGroupIfUnset({ tx, userId, groupId: group.id });
    // Notify existing active members that someone joined (excluding the joiner).
    const members = await repo.listActiveMembers({ db: tx, groupId: group.id });
    const actorName = members.find((m) => m.userId === userId)?.name ?? "חבר/ה חדש/ה";
    const events: NotificationEvent[] = members
      .filter((m) => m.userId !== userId)
      .map((m) => ({
        type: "group_member_joined" as const,
        userId: m.userId,
        groupId: group.id,
        groupNameHe: group.nameHe,
        actorName,
      }));
    await emitNotifications({ tx, events });
    dispatched = events;
  });
  try {
    await dispatchPush({ db, events: dispatched });
  } catch (e) {
    logger.error("push.group_join_dispatch_failed", { groupId: group.id, err: String(e) });
  }
  return group;
}

/**
 * Leave (or be removed from) a group. A departing OWNER hands off to the
 * longest-tenured admin (then member); if they're the sole member the group is
 * deleted (cascade). Otherwise the row flips to `left` (counters frozen, rejoin
 * restores). Returns whether the group was deleted.
 */
export async function leaveGroup({
  db = defaultDb,
  userId,
  groupId,
}: {
  db?: AppDb;
  userId: string;
  groupId: string;
}): Promise<{ deleted: boolean }> {
  const membership = await repo.getMembership({ db, groupId, userId });
  if (!membership || membership.status !== "active") throw new NotGroupMemberError();

  if (membership.role !== "owner") {
    await db.transaction(async (tx) => {
      await repo.setMemberStatus({ tx, groupId, userId, status: "left" });
      // Don't leave the leaver's bare-home pointing at a group they're no longer in.
      await repo.clearDefaultGroupIfMatches({ tx, userId, groupId });
    });
    return { deleted: false };
  }

  return db.transaction(async (tx) => {
    const heir = await repo.findSuccessor({ tx, groupId, excludeUserId: userId });
    if (!heir) {
      await repo.deleteGroup({ tx, groupId }); // sole member → archive (cascade clears defaultGroupId)
      return { deleted: true };
    }
    await repo.setMemberRole({ tx, groupId, userId: heir.userId, role: "owner" });
    await repo.setGroupOwner({ tx, groupId, ownerId: heir.userId });
    // Demote the departing owner (so a later rejoin via invite comes back as a
    // plain member, not a second owner) and flip them to left.
    await repo.setMemberRole({ tx, groupId, userId, role: "member" });
    await repo.setMemberStatus({ tx, groupId, userId, status: "left" });
    await repo.clearDefaultGroupIfMatches({ tx, userId, groupId });
    return { deleted: false };
  });
}

/** Owner/admin removes another member. Cannot remove the owner. */
export async function removeMember({
  db = defaultDb,
  actorId,
  groupId,
  targetUserId,
}: {
  db?: AppDb;
  actorId: string;
  groupId: string;
  targetUserId: string;
}): Promise<void> {
  const actor = await repo.getMembership({ db, groupId, userId: actorId });
  if (!actor || actor.status !== "active") throw new NotGroupMemberError();
  if (actor.role !== "owner" && actor.role !== "admin") throw new InsufficientGroupRoleError();

  const target = await repo.getMembership({ db, groupId, userId: targetUserId });
  if (!target || target.status !== "active") throw new NotGroupMemberError();
  if (target.role === "owner") throw new InsufficientGroupRoleError(); // the owner leaves via leaveGroup

  await db.transaction(async (tx) => {
    await repo.setMemberStatus({ tx, groupId, userId: targetUserId, status: "left" });
    // Clear the removed member's home group so their bare-home doesn't 404.
    await repo.clearDefaultGroupIfMatches({ tx, userId: targetUserId, groupId });
  });
}

/**
 * Membership-gated group read for the group page: resolves a slug to the group +
 * the viewer's active membership, or throws (not found / not a member).
 */
export async function getGroupForMember({
  db = defaultDb,
  slug,
  userId,
}: {
  db?: AppDb;
  slug: string;
  userId: string;
}): Promise<{ group: GroupRow; membership: GroupMemberRow }> {
  const group = await repo.getGroupBySlug({ db, slug });
  if (!group) throw new GroupNotFoundError();
  const membership = await repo.getMembership({ db, groupId: group.id, userId });
  if (!membership || membership.status !== "active") throw new NotGroupMemberError();
  return { group, membership };
}

/** The viewer's active groups (switcher / "my groups"). */
export async function listMyGroups({ db = defaultDb, userId }: { db?: AppDb; userId: string }) {
  return repo.listMyGroups({ db, userId });
}
