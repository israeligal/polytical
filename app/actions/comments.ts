"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { postComment, toggleCommentUpvote, hideComment } from "@/app/lib/comments/service";
import { EmptyCommentError, CommentTooLongError } from "@/app/lib/errors";

export async function postCommentAction({ marketId, body }: { marketId: string; body: string }) {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו כדי להגיב" };
  try {
    await postComment({ marketId, userId: s.user.id, body });
    revalidatePath(`/market/${marketId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof EmptyCommentError) return { ok: false, message: "אי אפשר להגיב ריק" };
    if (e instanceof CommentTooLongError) return { ok: false, message: "התגובה ארוכה מדי (עד 500 תווים)" };
    throw e;
  }
}

export async function upvoteCommentAction({ marketId, commentId }: { marketId: string; commentId: string }) {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו כדי להצביע" };
  const r = await toggleCommentUpvote({ commentId, userId: s.user.id });
  revalidatePath(`/market/${marketId}`);
  return { ok: true, upvoted: r.upvoted };
}

export async function hideCommentAction({ marketId, commentId }: { marketId: string; commentId: string }) {
  const s = await getSession();
  if (!s?.user?.isAdmin) return { ok: false, message: "להנהלה בלבד" };
  await hideComment({ commentId });
  revalidatePath(`/market/${marketId}`);
  return { ok: true };
}
