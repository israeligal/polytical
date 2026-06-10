"use client";

import { useState, useTransition } from "react";
import { deleteMarketAction, resolveMarketAction, voidMarketAction } from "@/app/actions/admin-markets";
import { formatDateTime } from "@/lib/time";

const FIELD =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

/**
 * One row of the admin market list: shows the market, its outcomes + the live
 * crowd split (predictor counts), and inline resolve (pick a winning outcome,
 * optional source/note), void, and hard-delete controls. All call admin server
 * actions (which re-check admin) and surface the result message.
 */
export function MarketAdminRow({
  marketId,
  questionHe,
  category,
  status,
  closeAtIso,
  outcomes,
}: {
  marketId: string;
  questionHe: string;
  category: string;
  status: string;
  closeAtIso: string;
  outcomes: { id: string; labelHe: string; predictors: number }[];
}) {
  const [winningOutcomeId, setWinningOutcomeId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  const total = outcomes.reduce((s, o) => s + o.predictors, 0);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fn();
        setOk(res.ok);
        setMessage(res.message ?? (res.ok ? "בוצע" : "שגיאה"));
      } catch {
        setOk(false);
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  function onResolve() {
    if (!winningOutcomeId) {
      setOk(false);
      setMessage("בחרו תוצאה זוכה");
      return;
    }
    run(() => resolveMarketAction({ marketId, winningOutcomeId, sourceUrl, note }));
  }

  function onVoid() {
    if (!window.confirm("לבטל את השוק?")) return;
    run(() => voidMarketAction({ marketId }));
  }

  function onDelete() {
    if (!window.confirm("למחוק את השוק לצמיתות? כל התחזיות והתגובות יימחקו ולא ניתן לשחזר."))
      return;
    run(() => deleteMarketAction({ marketId }));
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-foreground">{questionHe}</span>
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5">{category}</span>
          <span className="rounded-full bg-muted px-2 py-0.5">{status}</span>
          <span className="nums">{formatDateTime(closeAtIso)}</span>
        </span>
      </div>

      <ul className="mb-3 space-y-1 text-sm">
        {outcomes.map((o) => (
          <li key={o.id} className="flex items-center justify-between">
            <span className="text-foreground">{o.labelHe}</span>
            <span className="nums text-muted-foreground">
              {o.predictors} ניחושים ({total > 0 ? Math.round((o.predictors / total) * 100) : 0}%)
            </span>
          </li>
        ))}
      </ul>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={winningOutcomeId}
            onChange={(e) => setWinningOutcomeId(e.target.value)}
            className={FIELD}
            aria-label="תוצאה זוכה"
          >
            <option value="">— בחרו תוצאה זוכה —</option>
            {outcomes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.labelHe}
              </option>
            ))}
          </select>
          <input
            type="url"
            inputMode="url"
            dir="ltr"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            className={`${FIELD} text-start`}
            aria-label="קישור מקור"
            placeholder="קישור מקור (לא חובה)"
          />
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={FIELD}
          placeholder="הערת הכרעה (לא חובה)"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onResolve}
            disabled={pending}
            className="rounded-lg bg-positive px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "מסלק…" : "הכרע שוק"}
          </button>
          <button
            type="button"
            onClick={onVoid}
            disabled={pending}
            className="rounded-lg border-2 border-negative px-4 py-2 text-sm font-bold text-negative transition-colors hover:bg-negative/5 disabled:opacity-60"
          >
            בטל שוק
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="ms-auto rounded-lg bg-negative px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            מחק לצמיתות
          </button>
          {message && (
            <span
              role="status"
              className={`text-sm font-semibold ${ok ? "text-positive" : "text-negative"}`}
            >
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
