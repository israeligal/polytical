"use client";

import { useState, useTransition } from "react";
import { createMarketAction } from "@/app/actions/admin-markets";

const FIELD =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
const LABEL = "mb-1 block text-sm font-bold text-foreground";

/** Current local time in the `datetime-local` value format (YYYY-MM-DDTHH:mm). */
function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * Functional-plain admin form to create a market: question, optional description,
 * category, hot flag, close date, the two yes/no outcome labels, and optional
 * featured MK personIds. Yes/no is the only market type — the action enforces
 * it server-side too. Submits via the admin server action (which re-checks
 * admin) and shows the result message. Deliberately unpolished — this is an
 * internal console, not a public surface.
 */
export function CreateMarketForm({
  categories,
}: {
  categories: { key: string; he: string }[];
}) {
  const [hot, setHot] = useState(false);
  const [outcomes, setOutcomes] = useState<[string, string]>(["כן", "לא"]);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  function setOutcome(i: 0 | 1, value: string) {
    setOutcomes((prev) => (i === 0 ? [value, prev[1]] : [prev[0], value]));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const personIds = String(fd.get("personIds") ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

    setMessage(null);
    startTransition(async () => {
      try {
        const res = await createMarketAction({
          questionHe: String(fd.get("questionHe") ?? ""),
          descriptionHe: String(fd.get("descriptionHe") ?? ""),
          category: String(fd.get("category") ?? ""),
          hot,
          closeAt: String(fd.get("closeAt") ?? ""),
          outcomeLabels: outcomes,
          personIds,
        });
        setOk(res.ok);
        setMessage(res.message ?? (res.ok ? "השוק נוצר" : "שגיאה"));
        if (res.ok) {
          form.reset();
          setOutcomes(["כן", "לא"]);
          setHot(false);
        }
      } catch {
        setOk(false);
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <label className={LABEL} htmlFor="questionHe">
          שאלת השוק
        </label>
        <input id="questionHe" name="questionHe" required className={FIELD} placeholder="האם…?" />
      </div>

      <div>
        <label className={LABEL} htmlFor="descriptionHe">
          תיאור / קריטריון הכרעה (לא חובה)
        </label>
        <textarea id="descriptionHe" name="descriptionHe" rows={2} className={FIELD} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="category">
            קטגוריה
          </label>
          <select id="category" name="category" className={FIELD} defaultValue={categories[0]?.key}>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.he}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="closeAt">
            מועד סגירה
          </label>
          <input
            id="closeAt"
            name="closeAt"
            type="datetime-local"
            dir="ltr"
            min={nowLocalInput()}
            required
            className={FIELD}
          />
        </div>
      </div>

      <label className="flex items-center gap-1 text-sm font-bold text-foreground">
        <input type="checkbox" checked={hot} onChange={(e) => setHot(e.target.checked)} />
        שוק חם
      </label>

      <div>
        <span className={LABEL}>תוצאות (כן/לא)</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={outcomes[0]}
            onChange={(e) => setOutcome(0, e.target.value)}
            className={FIELD}
            aria-label="תוצאה חיובית"
          />
          <input
            value={outcomes[1]}
            onChange={(e) => setOutcome(1, e.target.value)}
            className={FIELD}
            aria-label="תוצאה שלילית"
          />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="personIds">
          personId של פוליטיקאים מובילים (מופרדים בפסיק, לא חובה)
        </label>
        <input id="personIds" name="personIds" className={FIELD} placeholder="123, 456" />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-5 py-2.5 font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "יוצר…" : "צור שוק"}
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
    </form>
  );
}
