import Link from "next/link";
import { getComments } from "@/app/lib/comments/service";
import { CommentForm } from "@/components/comments/comment-form";
import { CommentRow } from "@/components/comments/comment-row";

/**
 * Server-rendered discussion thread for a market: the visible-comment count, a
 * composer (or a sign-in link for logged-out visitors), and the ranked list of
 * comments. `viewerId` seeds each row's upvote state; `isAdmin` enables the
 * per-row hide control. Comments never touch coins — this reads only the
 * comments service.
 */
export async function CommentThread({
  marketId,
  viewerId,
  isAdmin,
}: {
  marketId: string;
  viewerId?: string;
  isAdmin: boolean;
}) {
  const comments = await getComments({ marketId, viewerId });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <span className="nums font-bold text-foreground">{comments.length}</span>{" "}
        {comments.length === 1 ? "תגובה" : "תגובות"}
      </p>

      {viewerId ? (
        <CommentForm marketId={marketId} />
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-semibold text-primary hover:underline">
            התחברו כדי להגיב
          </Link>
        </p>
      )}

      {comments.length > 0 ? (
        // User-generated and unbounded → scroll past ~6 comments (ordered by
        // upvotes, so the best stay above the fold).
        <div className="max-h-[30rem] space-y-3 overflow-y-auto pe-1">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              marketId={marketId}
              commentId={c.id}
              authorHandle={c.authorHandle}
              body={c.body}
              createdAtIso={c.createdAt.toISOString()}
              upvotes={c.upvotes}
              mineUpvoted={c.mineUpvoted}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-6 text-center text-muted-foreground">
          היו הראשונים להגיב
        </p>
      )}
    </div>
  );
}
