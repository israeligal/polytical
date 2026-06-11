"use client";

import { useState, useTransition } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { approveSuggestionAction, rejectSuggestionAction } from "@/app/actions/suggestions";
import { formatDate, isoToLocalInput, nowLocalInput } from "@/lib/time";

const FIELD =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

/**
 * One pending community suggestion in the admin queue: approve (creating a real
 * binary market with the given close date) or reject (with an optional note).
 * Both actions re-check admin server-side; on success the page revalidates and
 * the row drops out of the pending list.
 */
export function SuggestionReviewRow({
  suggestionId,
  questionHe,
  categoryHe,
  proposerName,
  personName,
  createdAtIso,
  proposedCloseAtIso,
  resolutionSourceNote,
}: {
  suggestionId: string;
  questionHe: string;
  categoryHe: string;
  proposerName: string;
  personName: string | null;
  createdAtIso: string;
  proposedCloseAtIso: string | null;
  resolutionSourceNote: string | null;
}) {
  // Pre-filled from the proposer's intended decision date; still editable.
  // Both the prefill and min are BROWSER-local conversions, so they're derived
  // only after hydration — an SSR'd value shifts by the server tz + breaks
  // hydration. `closeAtEdit` is null until the admin touches the field.
  const hydrated = useHydrated();
  const [closeAtEdit, setCloseAtEdit] = useState<string | null>(null);
  const closeAt =
    closeAtEdit ?? (hydrated && proposedCloseAtIso ? isoToLocalInput(proposedCloseAtIso) : "");
  const minLocal = hydrated ? nowLocalInput() : undefined;
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  function approve() {
    setMessage(null);
    if (!closeAt) {
      setOk(false);
      setMessage("בחרו מועד סגירה לפני אישור");
      return;
    }
    startTransition(async () => {
      try {
        // Browser-local input value → UTC instant here, NOT on the server (its
        // `new Date(...)` would parse the offset-less string in the server tz).
        const res = await approveSuggestionAction({ suggestionId, closeAt: new Date(closeAt).toISOString() });
        setOk(res.ok);
        setMessage(res.message ?? (res.ok ? "אושר" : "שגיאה"));
      } catch {
        setOk(false);
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  function reject() {
    // Rejection is terminal — guard against a mis-tap (mirrors the void-market confirm).
    if (!window.confirm("לדחות את ההצעה? הפעולה סופית.")) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await rejectSuggestionAction({ suggestionId, note: note.trim() || undefined });
        setOk(res.ok);
        setMessage(res.message ?? (res.ok ? "נדחה" : "שגיאה"));
      } catch {
        setOk(false);
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  const created = formatDate(createdAtIso);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* wrap-anywhere: questionHe is user-submitted — an unbroken long string
            must not blow the admin layout on mobile. */}
        <p className="min-w-0 wrap-anywhere font-display text-lg font-bold text-foreground">{questionHe}</p>
        <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-bold text-foreground">
          {categoryHe}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        הציע/ה: {proposerName}
        {personName ? <> · קשור ל{personName}</> : null} · {created}
      </p>
      {resolutionSourceNote && (
        <p className="mt-1 text-sm text-muted-foreground">מקור הכרעה מוצע: {resolutionSourceNote}</p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr]">
        <div>
          <label className="mb-1 block text-xs font-bold text-foreground" htmlFor={`close-${suggestionId}`}>
            מועד סגירה
          </label>
          <input
            id={`close-${suggestionId}`}
            type="datetime-local"
            dir="ltr"
            min={minLocal}
            value={closeAt}
            onChange={(e) => setCloseAtEdit(e.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-foreground" htmlFor={`note-${suggestionId}`}>
            הערת דחייה (לא חובה)
          </label>
          <input
            id={`note-${suggestionId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={FIELD}
            placeholder="סיבה לדחייה…"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={approve}
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "…" : "אשר ופתח תחזית"}
        </button>
        <button
          type="button"
          onClick={reject}
          disabled={pending}
          className="rounded-lg border border-border px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:text-negative disabled:opacity-60"
        >
          דחה
        </button>
        {message && (
          <span role="status" className={`text-sm font-semibold ${ok ? "text-positive" : "text-negative"}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
