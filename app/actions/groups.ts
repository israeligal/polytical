"use server";
import { revalidatePath } from "next/cache";
import { getSession, refreshSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { createGroup, joinGroup, leaveGroup } from "@/app/lib/groups/service";
import { createGroupMotion, resolveGroupMotion } from "@/app/lib/groups/motions";
import { getMarketBundle } from "@/app/lib/markets/repo";
import {
  GroupNotFoundError,
  NotGroupMemberError,
  InsufficientGroupRoleError,
  InvalidInviteCodeError,
  GroupCapError,
  GroupNameError,
  SuggestionTooShortError,
  SuggestionTooLongError,
  InvalidCategoryError,
  ClosePastError,
  CloseRequiredError,
  OutcomeCountError,
  OutcomeLabelError,
  DailySuggestionLimitError,
  MarketNotFoundError,
  AlreadyResolvedError,
  InvalidOutcomeError,
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

type MotionActionResult = ActionResult & { marketId?: string };

/** Any active member posts a הצעה — it goes live immediately. */
export async function createGroupMotionAction({
  groupId,
  slug,
  questionHe,
  category,
  proposedCloseAt,
  outcomes,
}: {
  groupId: string;
  slug: string;
  questionHe: string;
  category: string;
  proposedCloseAt: string;
  outcomes?: { labelHe: string }[] | null;
}): Promise<MotionActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };

  const limit = checkRateLimit({ key: `group-motion:${s.user.id}`, max: 8, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) return { ok: false, message: "יותר מדי הצעות — נסו שוב מאוחר יותר" };

  let marketId: string;
  try {
    const res = await createGroupMotion({
      userId: s.user.id,
      groupId,
      questionHe,
      category,
      closeAt: new Date(proposedCloseAt),
      outcomes: outcomes ?? null,
    });
    marketId = res.marketId;
  } catch (e) {
    if (e instanceof NotGroupMemberError) return { ok: false, message: "רק חברי הקואליציה יכולים להעלות הצעה" };
    if (e instanceof SuggestionTooShortError) return { ok: false, message: "ההצעה קצרה מדי (לפחות 10 תווים)" };
    if (e instanceof SuggestionTooLongError) return { ok: false, message: "ההצעה ארוכה מדי (עד 100 תווים)" };
    if (e instanceof InvalidCategoryError) return { ok: false, message: "קטגוריה לא תקינה" };
    if (e instanceof CloseRequiredError) return { ok: false, message: "בחרו תאריך הכרעה" };
    if (e instanceof ClosePastError) return { ok: false, message: "תאריך ההכרעה חייב להיות בעתיד" };
    if (e instanceof OutcomeCountError) return { ok: false, message: "הצעה עם כמה תשובות צריכה 2–8 תשובות" };
    if (e instanceof OutcomeLabelError) return { ok: false, message: "כל תשובה צריכה תווית ייחודית של עד 40 תווים" };
    if (e instanceof DailySuggestionLimitError) return { ok: false, message: "הגעתם למכסת ההצעות היומית בקואליציה" };
    throw e;
  }
  revalidatePath(`/g/${slug}`);
  return { ok: true, marketId };
}

/**
 * Clone a GLOBAL forecast into one of the caller's groups as a new group motion
 * (non-destructive — the source market is untouched). Re-reads the source
 * server-side (never trusts the client); rejects cloning a group motion.
 */
export async function cloneForecastToGroupAction({
  groupId,
  slug,
  sourceMarketId,
  proposedCloseAt,
}: {
  groupId: string;
  slug: string;
  sourceMarketId: string;
  proposedCloseAt: string;
}): Promise<MotionActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };

  const limit = checkRateLimit({ key: `group-motion:${s.user.id}`, max: 8, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) return { ok: false, message: "יותר מדי הצעות — נסו שוב מאוחר יותר" };

  // Authoritative re-read — the question/outcomes/politicians come from the DB,
  // not the client. A group motion can't be cloned globally.
  const bundle = await getMarketBundle({ marketId: sourceMarketId });
  if (!bundle || bundle.market.groupId) return { ok: false, message: "התחזית לא נמצאה" };

  const isMulti = bundle.market.type === "multi";
  let marketId: string;
  try {
    const res = await createGroupMotion({
      userId: s.user.id,
      groupId,
      questionHe: bundle.market.questionHe,
      category: bundle.market.category,
      closeAt: new Date(proposedCloseAt),
      outcomes: isMulti
        ? bundle.outcomes.map((o) => ({ labelHe: o.labelHe, personId: o.personId ?? undefined }))
        : null,
      personIds: bundle.personIds,
    });
    marketId = res.marketId;
  } catch (e) {
    if (e instanceof NotGroupMemberError) return { ok: false, message: "רק חברי הקואליציה יכולים להביא תחזית" };
    if (e instanceof SuggestionTooShortError) return { ok: false, message: "השאלה קצרה מדי" };
    if (e instanceof SuggestionTooLongError) return { ok: false, message: "השאלה ארוכה מדי" };
    if (e instanceof InvalidCategoryError) return { ok: false, message: "קטגוריה לא תקינה" };
    if (e instanceof CloseRequiredError) return { ok: false, message: "בחרו תאריך הכרעה" };
    if (e instanceof ClosePastError) return { ok: false, message: "תאריך ההכרעה חייב להיות בעתיד" };
    if (e instanceof OutcomeCountError) return { ok: false, message: "אפשרויות התשובה אינן תקינות" };
    if (e instanceof OutcomeLabelError) return { ok: false, message: "אפשרויות התשובה אינן תקינות" };
    if (e instanceof DailySuggestionLimitError) return { ok: false, message: "הגעתם למכסת ההצעות היומית בקואליציה" };
    throw e;
  }
  revalidatePath(`/g/${slug}`);
  return { ok: true, marketId };
}

/** Group owner/admin marks the winning outcome (drives the group scoreboard). */
export async function resolveGroupMotionAction({
  groupId,
  slug,
  marketId,
  winningOutcomeId,
  sourceUrl,
  note,
}: {
  groupId: string;
  slug: string;
  marketId: string;
  winningOutcomeId: string;
  sourceUrl?: string;
  note?: string;
}): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };
  const limit = checkRateLimit({ key: `group-resolve:${s.user.id}`, max: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע ונסו שוב" };

  try {
    await resolveGroupMotion({ actorId: s.user.id, groupId, marketId, winningOutcomeId, sourceUrl, note });
  } catch (e) {
    if (e instanceof NotGroupMemberError) return { ok: false, message: "אינכם חברים בקואליציה" };
    if (e instanceof InsufficientGroupRoleError) return { ok: false, message: "רק מנהלי הקואליציה יכולים להכריע" };
    if (e instanceof AlreadyResolvedError) return { ok: false, message: "ההצעה כבר הוכרעה" };
    if (e instanceof MarketNotFoundError) return { ok: false, message: "ההצעה לא נמצאה" };
    if (e instanceof InvalidOutcomeError) return { ok: false, message: "תשובה לא תקינה" };
    throw e;
  }
  revalidatePath(`/market/${marketId}`);
  revalidatePath(`/g/${slug}`);
  return { ok: true, message: "ההצעה הוכרעה" };
}
