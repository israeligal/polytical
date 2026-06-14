"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGroupMotionAction } from "@/app/actions/groups";
import { SelectField } from "@/components/select-field";
import { nowLocalInput } from "@/lib/time";
import { useHydrated } from "@/lib/use-hydrated";

const QUESTION_MAX = 100;
const LABEL_MAX = 40;
const MIN_OUTCOMES = 2;
const MAX_OUTCOMES = 8;

const FIELD =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
const LABEL = "mb-1 block text-sm font-bold text-foreground";

/** Post a הצעה לסדר inside a group — mirrors SuggestMarketForm, minus the
 *  politician picker (group motions are casual). Binary כן/לא by default. */
export function GroupMotionForm({
  groupId,
  slug,
  categories,
}: {
  groupId: string;
  slug: string;
  categories: { key: string; he: string }[];
}) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState(categories[0]?.key ?? "");
  const [closeAt, setCloseAt] = useState("");
  const [isMulti, setIsMulti] = useState(false);
  const [labels, setLabels] = useState<string[]>(["", ""]);
  const hydrated = useHydrated();
  const minLocal = hydrated ? nowLocalInput() : undefined;
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const validLabels = labels.map((l) => l.trim()).filter((l) => l.length > 0);
  const multiReady = !isMulti || validLabels.length >= MIN_OUTCOMES;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await createGroupMotionAction({
          groupId,
          slug,
          questionHe: question,
          category,
          proposedCloseAt: new Date(closeAt).toISOString(),
          outcomes: isMulti ? validLabels.map((labelHe) => ({ labelHe })) : null,
        });
        if (res.ok && res.marketId) {
          router.push(`/market/${res.marketId}`);
          return;
        }
        setMessage(res.message ?? "שגיאה");
      } catch {
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <label className={LABEL} htmlFor="motion-q">שאלת ההצעה</label>
        <input
          id="motion-q"
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, QUESTION_MAX))}
          required
          className={FIELD}
          placeholder="קצר וחד: ״ביבי יישאר ראש הממשלה עד סוף השנה?״"
        />
        <p className="mt-1 text-start text-xs text-muted-foreground">
          <span className="nums">{QUESTION_MAX - question.length}</span> תווים נותרו
        </p>
      </div>

      <div>
        <span className={LABEL}>אפשרויות התשובה</span>
        <div className="flex gap-2" role="group" aria-label="סוג ההצעה">
          <button
            type="button"
            onClick={() => setIsMulti(false)}
            aria-pressed={!isMulti}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold transition-all ${!isMulti ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}
          >
            כן / לא
          </button>
          <button
            type="button"
            onClick={() => setIsMulti(true)}
            aria-pressed={isMulti}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold transition-all ${isMulti ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}
          >
            כמה תשובות
          </button>
        </div>
        {isMulti && (
          <div className="mt-3 space-y-2">
            {labels.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="nums w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                <input
                  value={l}
                  onChange={(e) => setLabels((prev) => prev.map((x, j) => (j === i ? e.target.value.slice(0, LABEL_MAX) : x)))}
                  className={`${FIELD} flex-1`}
                  placeholder={`תשובה ${i + 1}`}
                  aria-label={`תשובה ${i + 1}`}
                />
                {labels.length > MIN_OUTCOMES && (
                  <button
                    type="button"
                    onClick={() => setLabels((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`הסרת תשובה ${i + 1}`}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-negative hover:text-negative"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {labels.length < MAX_OUTCOMES && (
              <button
                type="button"
                onClick={() => setLabels((prev) => [...prev, ""])}
                className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                + הוסיפו תשובה
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="motion-cat">קטגוריה</label>
          <SelectField id="motion-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={FIELD}>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>{c.he}</option>
            ))}
          </SelectField>
        </div>
        <div>
          <label className={LABEL} htmlFor="motion-close">מתי ההצעה תוכרע?</label>
          <input
            id="motion-close"
            type="datetime-local"
            dir="ltr"
            required
            min={minLocal}
            value={closeAt}
            onChange={(e) => setCloseAt(e.target.value)}
            className={FIELD}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || question.trim().length === 0 || !closeAt || !multiReady}
          className="rounded-lg bg-primary px-5 py-2.5 font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "מעלים…" : "העלו הצעה לסדר"}
        </button>
        {message && <span role="status" className="text-sm font-semibold text-negative">{message}</span>}
      </div>
    </form>
  );
}
