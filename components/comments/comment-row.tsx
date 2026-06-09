"use client";

import { useState, useTransition } from "react";
import { upvoteCommentAction, hideCommentAction } from "@/app/actions/comments";
import { formatDate } from "@/lib/time";

/**
 * A single comment: author initial + name, posted date, body, an upvote pill
 * (filled when the viewer already upvoted), and — for admins only — a small
 * "הסתר" moderation button.
 *
 * Upvote and hide are optimistic: the pill toggles its filled state and bumps
 * the count locally before the `upvoteCommentAction` round-trip resolves, and a
 * hidden row drops out of the list immediately. `revalidatePath` in the actions
 * reconciles the server-rendered list on the next render. Both actions re-check
 * the session/admin flag server-side.
 */
export function CommentRow({
  marketId,
  commentId,
  authorName,
  body,
  createdAtIso,
  upvotes,
  mineUpvoted,
  isAdmin,
}: {
  marketId: string;
  commentId: string;
  authorName: string;
  body: string;
  createdAtIso: string;
  upvotes: number;
  mineUpvoted: boolean;
  isAdmin: boolean;
}) {
  const [voted, setVoted] = useState(mineUpvoted);
  const [count, setCount] = useState(upvotes);
  const [hidden, setHidden] = useState(false);
  const [, startVote] = useTransition();
  const [, startHide] = useTransition();

  const initial = authorName.trim().charAt(0) || "?";

  function toggleVote() {
    // Optimistic flip; the action reconciles via revalidatePath. Roll back by
    // INVERTING this flip (functional update) rather than resetting to the
    // original props, so a rapid double-vote can't snap the count to a stale
    // baseline and permanently desync.
    const next = !voted;
    const rollback = () => {
      setVoted(!next);
      setCount((c) => c + (next ? -1 : 1));
    };
    setVoted(next);
    setCount((c) => c + (next ? 1 : -1));
    startVote(async () => {
      try {
        const res = await upvoteCommentAction({ marketId, commentId });
        if (!res.ok) rollback();
      } catch {
        rollback();
      }
    });
  }

  function hide() {
    setHidden(true);
    startHide(async () => {
      try {
        const res = await hideCommentAction({ marketId, commentId });
        if (!res.ok) setHidden(false);
      } catch {
        setHidden(false);
      }
    });
  }

  if (hidden) return null;

  return (
    <article className="flex gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-black text-primary"
      >
        {initial}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-bold text-foreground">{authorName}</span>
          <span className="text-border">•</span>
          <time dateTime={createdAtIso} className="text-muted-foreground">
            {formatDate(createdAtIso)}
          </time>
        </div>

        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
          {body}
        </p>

        <div className="mt-2.5 flex items-center gap-3">
          <button
            type="button"
            onClick={toggleVote}
            aria-pressed={voted}
            aria-label={voted ? "בטלו הצבעה" : "הצביעו בעד התגובה"}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 transition-colors ${
              voted
                ? "bg-primary text-primary-foreground ring-primary"
                : "bg-card text-muted-foreground ring-border hover:ring-primary"
            }`}
          >
            <span aria-hidden="true">▲</span>
            <span className="nums">{count}</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={hide}
              className="text-xs font-semibold text-muted-foreground transition-colors hover:text-negative"
            >
              הסתר
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
