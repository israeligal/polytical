"use client";

import { useState, useTransition } from "react";
import { postCommentAction } from "@/app/actions/comments";

// Mirrors the service's MAX_COMMENT_LEN. Kept as a local literal so this client
// component never imports the comments service (it pulls in the db driver, which
// must not reach the browser bundle); the server action is the authority.
const MAX_COMMENT_LEN = 500;

/**
 * Logged-in comment composer: a length-capped textarea with a live character
 * counter and a post button driven by the `postCommentAction` server action via
 * `useTransition`. On success it clears the field; on failure it surfaces the
 * action's Hebrew message. The action re-checks the session server-side.
 */
export function CommentForm({ marketId }: { marketId: string }) {
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_COMMENT_LEN;
  const remaining = MAX_COMMENT_LEN - body.length;

  function submit() {
    if (!canSubmit) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await postCommentAction({ marketId, body });
        if (res.ok) {
          setBody("");
        } else {
          setMessage(res.message ?? "שגיאה");
        }
      } catch {
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_COMMENT_LEN}
        rows={3}
        placeholder="מה דעתכם על השוק הזה?"
        className="w-full resize-none rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="mt-3 flex items-center justify-between">
        <span
          className={`nums text-xs font-semibold ${
            remaining < 0 ? "text-negative" : "text-muted-foreground"
          }`}
        >
          {remaining}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !canSubmit}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {pending ? "שולח…" : "פרסמו"}
        </button>
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm font-semibold text-negative">
          {message}
        </p>
      )}
    </div>
  );
}
