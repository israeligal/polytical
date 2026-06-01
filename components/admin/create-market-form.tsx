"use client";

import { useState, useTransition } from "react";
import { createMarketAction } from "@/app/actions/admin-markets";

const FIELD =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
const LABEL = "mb-1 block text-sm font-bold text-foreground";

/**
 * Functional-plain admin form to create a market: question, optional description,
 * category, type (binary/multi), hot flag, close date, 2+ outcome labels, and
 * optional featured MK personIds. Submits via the admin server action (which
 * re-checks admin) and shows the result message. Deliberately unpolished — this
 * is an internal console, not a public surface.
 */
export function CreateMarketForm({
  categories,
}: {
  categories: { key: string; he: string }[];
}) {
  const [type, setType] = useState<"binary" | "multi">("binary");
  const [hot, setHot] = useState(false);
  const [outcomes, setOutcomes] = useState<string[]>(["כן", "לא"]);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  function setOutcome(i: number, value: string) {
    setOutcomes((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function addOutcome() {
    setOutcomes((prev) => [...prev, ""]);
  }
  function removeOutcome(i: number) {
    setOutcomes((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));
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
      const res = await createMarketAction({
        questionHe: String(fd.get("questionHe") ?? ""),
        descriptionHe: String(fd.get("descriptionHe") ?? ""),
        category: String(fd.get("category") ?? ""),
        type,
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
        setType("binary");
        setHot(false);
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
          <input id="closeAt" name="closeAt" type="datetime-local" required className={FIELD} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">סוג:</span>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="radio"
              name="type"
              checked={type === "binary"}
              onChange={() => setType("binary")}
            />
            בינארי
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="radio"
              name="type"
              checked={type === "multi"}
              onChange={() => setType("multi")}
            />
            מרובה
          </label>
        </div>
        <label className="flex items-center gap-1 text-sm font-bold text-foreground">
          <input type="checkbox" checked={hot} onChange={(e) => setHot(e.target.checked)} />
          שוק חם
        </label>
      </div>

      <div>
        <span className={LABEL}>תוצאות (לפחות שתיים)</span>
        <div className="space-y-2">
          {outcomes.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={o}
                onChange={(e) => setOutcome(i, e.target.value)}
                className={FIELD}
                placeholder={`תוצאה ${i + 1}`}
              />
              {outcomes.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOutcome(i)}
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-negative"
                >
                  הסר
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addOutcome}
          className="mt-2 rounded-md border border-border px-3 py-1 text-xs font-bold text-primary hover:bg-primary/5"
        >
          + הוסף תוצאה
        </button>
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
