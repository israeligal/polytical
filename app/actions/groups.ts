"use server";
import { revalidatePath } from "next/cache";
import { getSession, refreshSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { createGroup, joinGroup, leaveGroup } from "@/app/lib/groups/service";
import {
  GroupNotFoundError,
  NotGroupMemberError,
  InsufficientGroupRoleError,
  InvalidInviteCodeError,
  GroupCapError,
  GroupNameError,
} from "@/app/lib/errors";
import type { ActionResult } from "./types";

// Group actions. Session-gated AND rate-limited (Better Auth's limiter can't see
// a Server Action). createGroup/joinGroup may auto-set the user's home group, so
// they refreshSession() + revalidate the layout — the same cookie-heal the
// onboarding flow uses, so the proxy landing sees the new defaultGroupId without
// a stale-cookie loop.

type GroupActionResult = ActionResult & { slug?: string };

/** Create a group; the caller becomes its owner. Returns the new slug. */
export async function createGroupAction({
  nameHe,
  descriptionHe,
  emblem,
  colorToken,
}: {
  nameHe: string;
  descriptionHe?: string | null;
  emblem?: string | null;
  colorToken?: string | null;
}): Promise<GroupActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו כדי ליצור קואליציה" };

  const limit = checkRateLimit({ key: `group-create:${s.user.id}`, max: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    const mins = Math.ceil(limit.retryAfterMs / 60000);
    return { ok: false, message: `יותר מדי קואליציות חדשות — נסו שוב בעוד ${mins} דקות` };
  }

  let slug: string;
  try {
    const group = await createGroup({
      userId: s.user.id,
      input: { nameHe, descriptionHe: descriptionHe ?? null, emblem: emblem ?? null, colorToken: colorToken ?? null },
    });
    slug = group.slug;
  } catch (e) {
    if (e instanceof GroupNameError) return { ok: false, message: "שם הקואליציה חייב להיות 2–40 תווים" };
    if (e instanceof GroupCapError) return { ok: false, message: "הגעתם למספר הקואליציות המרבי" };
    throw e;
  }
  await refreshSession();
  revalidatePath("/", "layout");
  return { ok: true, slug, message: "הקואליציה נוצרה!" };
}

/** Join a group via its invite code. Idempotent. Returns the group's slug. */
export async function joinGroupAction({ inviteCode }: { inviteCode: string }): Promise<GroupActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו כדי להצטרף" };

  const limit = checkRateLimit({ key: `group-join:${s.user.id}`, max: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע ונסו שוב" };

  let slug: string;
  try {
    const group = await joinGroup({ userId: s.user.id, inviteCode });
    slug = group.slug;
  } catch (e) {
    if (e instanceof InvalidInviteCodeError) return { ok: false, message: "קישור ההזמנה אינו תקין" };
    if (e instanceof GroupCapError) return { ok: false, message: "הקואליציה מלאה, או שהגעתם למספר הקואליציות המרבי" };
    throw e;
  }
  await refreshSession();
  revalidatePath("/", "layout");
  return { ok: true, slug, message: "הצטרפתם לקואליציה!" };
}

/** Leave a group (owner hands off / sole owner deletes it). */
export async function leaveGroupAction({ groupId }: { groupId: string }): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };

  const limit = checkRateLimit({ key: `group-leave:${s.user.id}`, max: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע ונסו שוב" };

  try {
    await leaveGroup({ userId: s.user.id, groupId });
  } catch (e) {
    if (e instanceof NotGroupMemberError) return { ok: false, message: "אינכם חברים בקואליציה הזו" };
    if (e instanceof InsufficientGroupRoleError) return { ok: false, message: "אין לכם הרשאה" };
    if (e instanceof GroupNotFoundError) return { ok: false, message: "הקואליציה לא נמצאה" };
    throw e;
  }
  // The user's defaultGroupId may have been nulled (group deleted) — heal the cookie.
  await refreshSession();
  revalidatePath("/", "layout");
  return { ok: true, message: "עזבתם את הקואליציה" };
}
