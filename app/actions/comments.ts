"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { postComment, toggleCommentUpvote, hideComment } from "@/app/lib/comments/service";
import { EmptyCommentError, CommentTooLongError } from "@/app/lib/errors";
import { isForeignKeyViolation } from "@/app/lib/pg-errors";

export async function postCommentAction({ marketId, body }: { marketId: string; body: string }) {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו כדי להגיב" };
  const limit = checkRateLimit({ key: `comment:${s.user.id}`, max: 8, windowMs: 5 * 60_000 });
  if (!limit.allowed) return { ok: false, message: "יותר מדי תגובות — נסו שוב מאוחר יותר" };
  try {
    await postComment({ marketId, userId: s.user.id, body });
    revalidatePath(`/market/${marketId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof EmptyCommentError) return { ok: false, message: "אי אפשר להגיב ריק" };
    if (e instanceof CommentTooLongError) return { ok: false, message: "התגובה ארוכה מדי (עד 500 תווים)" };
    // The market can be hard-deleted while the page is open — the insert then
    // hits the comments.marketId FK instead of a domain error.
    if (isForeignKeyViolation(e)) return { ok: false, message: "התחזית הוסרה" };
    throw e;
  }
}

export async function upvoteCommentAction({ marketId, commentId }: { marketId: string; commentId: string }) {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו כדי להצביע" };
  // Generous cap to stop rapid toggle-spam (the vote itself is idempotent).
  const limit = checkRateLimit({ key: `upvote:${s.user.id}`, max: 40, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע" };
  try {
    const r = await toggleCommentUpvote({ commentId, userId: s.user.id });
    revalidatePath(`/market/${marketId}`);
    return { ok: true, upvoted: r.upvoted };
  } catch {
    // A forged/stale commentId can raise a raw FK error — surface a controlled
    // not-ok so the optimistic client rolls back instead of hanging.
    return { ok: false };
  }
}

export async function hideCommentAction({ marketId, commentId }: { marketId: string; commentId: string }) {
  const s = await getSession();
  if (!s?.user?.isAdmin) return { ok: false, message: "להנהלה בלבד" };
  try {
    await hideComment({ commentId });
    revalidatePath(`/market/${marketId}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
