"use client";

import { useState, useTransition } from "react";
import { suggestMarketAction } from "@/app/actions/suggestions";
import { nowLocalInput } from "@/lib/time";

// Inlined to keep the server (which pulls the db driver) out of the client
// bundle — mirrors comment-form.tsx. The service is the real authority.
const MAX_SUGGESTION_LEN = 200;

const FIELD =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
const LABEL = "mb-1 block text-sm font-bold text-foreground";

/**
 * Public form for proposing a market: a question, a category, and an optional
 * featured MK. Submits via the rate-limited server action and shows the result.
 * On success it clears so a user can propose another.
 */
export function SuggestMarketForm({
  categories,
  politicians,
  defaultPersonId,
}: {
  categories: { key: string; he: string }[];
  politicians: { personId: number; name: string }[];
  defaultPersonId?: number;
}) {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState(categories[0]?.key ?? "");
  const [personId, setPersonId] = useState<string>(defaultPersonId ? String(defaultPersonId) : "");
  const [closeAt, setCloseAt] = useState("");
  const [source, setSource] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await suggestMarketAction({
          questionHe: question,
          category,
          personId: personId ? Number(personId) : null,
          proposedCloseAt: closeAt,
          resolutionSourceNote: source.trim() || null,
        });
        setOk(res.ok);
        setMessage(res.message ?? (res.ok ? "נשלח" : "שגיאה"));
        if (res.ok) {
          setQuestion("");
          setPersonId("");
          setCloseAt("");
          setSource("");
        }
      } catch {
        setOk(false);
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  const remaining = MAX_SUGGESTION_LEN - question.length;

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <label className={LABEL} htmlFor="question">
          שאלת השוק
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, MAX_SUGGESTION_LEN))}
          rows={3}
          required
          className={FIELD}
          placeholder="האם… עד מתי… מי…? נסחו שאלה שאפשר להכריע באופן חד-משמעי ממקור רשמי."
        />
        <p className="mt-1 text-start text-xs text-muted-foreground">
          <span className="nums">{remaining}</span> תווים נותרו
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="category">
            קטגוריה
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={FIELD}
          >
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.he}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="closeAt">
            מתי השאלה תוכרע?
          </label>
          <input
            id="closeAt"
            type="datetime-local"
            dir="ltr"
            required
            min={nowLocalInput()}
            value={closeAt}
            onChange={(e) => setCloseAt(e.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="personId">
            פוליטיקאי קשור (לא חובה)
          </label>
          <select
            id="personId"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className={FIELD}
          >
            <option value="">ללא</option>
            {politicians.map((p) => (
              <option key={p.personId} value={p.personId}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="source">
            מקור הכרעה (לא חובה)
          </label>
          <input
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value.slice(0, 300))}
            className={FIELD}
            placeholder="למשל: אתר הכנסת, פרסום ברשומות, הודעה רשמית…"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || question.trim().length === 0 || !closeAt}
          className="rounded-lg bg-primary px-5 py-2.5 font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "מגישים…" : "הגישו הצעה לסדר"}
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
