"use client";

import { useState, useTransition } from "react";
import { suggestMarketAction, searchPoliticiansSuggestAction } from "@/app/actions/suggestions";
import { PoliticianCombobox } from "@/components/politician-combobox";
import type { PoliticianOption } from "@/lib/types";
import { nowLocalInput } from "@/lib/time";
import { useHydrated } from "@/lib/use-hydrated";

// Inlined to keep the server (which pulls the db driver) out of the client
// bundle — mirrors comment-form.tsx. The service is the real authority.
const MAX_SUGGESTION_LEN = 100;
const MAX_SOURCE_NOTE_LEN = 300;
const MAX_OUTCOME_LABEL_LEN = 40;
const MIN_OUTCOMES = 2;
const MAX_OUTCOMES = 8;

const FIELD =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
const LABEL = "mb-1 block text-sm font-bold text-foreground";

interface OutcomeDraft {
  labelHe: string;
  politician: PoliticianOption | null;
  /** True while labelHe was auto-filled from the politician name (not hand-typed). */
  wasAuto: boolean;
}

/**
 * Public form for proposing a market — Polymarket-style: a SHORT decisive
 * question, then either the default כן/לא or a structured outcome set where
 * each row may BE a politician (picking one auto-fills the label).
 * `defaultPolitician` pre-selects a politician in binary mode when arriving
 * from a politician card page.
 */
export function SuggestMarketForm({
  categories,
  defaultPolitician,
}: {
  categories: { key: string; he: string }[];
  defaultPolitician?: PoliticianOption | null;
}) {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState(categories[0]?.key ?? "");
  const [politician, setPolitician] = useState<PoliticianOption | null>(defaultPolitician ?? null);
  const [closeAt, setCloseAt] = useState("");
  const [source, setSource] = useState("");
  const [isMulti, setIsMulti] = useState(false);
  const [outcomes, setOutcomes] = useState<OutcomeDraft[]>([
    { labelHe: "", politician: null, wasAuto: false },
    { labelHe: "", politician: null, wasAuto: false },
  ]);
  // min must be the BROWSER's clock — computing it during SSR shifts it by the
  // server timezone and trips a hydration mismatch, so it's derived post-hydration.
  const hydrated = useHydrated();
  const minLocal = hydrated ? nowLocalInput() : undefined;
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  function setOutcomePolitician(i: number, p: PoliticianOption | null) {
    setOutcomes((prev) =>
      prev.map((o, j) => {
        if (j !== i) return o;
        if (p) {
          const autoLabel = p.nameHe.slice(0, MAX_OUTCOME_LABEL_LEN);
          // Picking a politician auto-fills an empty or previously-auto label.
          const shouldFill = !o.labelHe || o.wasAuto;
          return {
            ...o,
            politician: p,
            labelHe: shouldFill ? autoLabel : o.labelHe,
            wasAuto: shouldFill,
          };
        }
        return { ...o, politician: null };
      }),
    );
  }

  function setOutcomeLabel(i: number, text: string) {
    setOutcomes((prev) =>
      prev.map((o, j) => {
        if (j !== i) return o;
        // Once the user types manually, the label is no longer auto-managed —
        // a later politician re-pick must not clobber it (clearing the label
        // re-arms auto-fill via the !labelHe branch in setOutcomePolitician).
        return { ...o, labelHe: text, wasAuto: false };
      }),
    );
  }

  const validOutcomes = outcomes.filter((o) => o.labelHe.trim().length > 0);
  const multiReady = !isMulti || validOutcomes.length >= MIN_OUTCOMES;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      try {
        // Convert the browser-local datetime-local value to a UTC instant HERE —
        // the server's `new Date(...)` would otherwise parse it in the server tz.
        const res = await suggestMarketAction({
          questionHe: question,
          category,
          // In multi mode, politicians live per-outcome; no top-level personId.
          personId: isMulti ? null : (politician?.personId ?? null),
          outcomes: isMulti
            ? validOutcomes.map((o) => ({
                labelHe: o.labelHe.trim(),
                personId: o.politician?.personId ?? null,
              }))
            : null,
          proposedCloseAt: new Date(closeAt).toISOString(),
          resolutionSourceNote: source.trim() || null,
        });
        setOk(res.ok);
        setMessage(res.message ?? (res.ok ? "נשלח" : "שגיאה"));
        if (res.ok) {
          setQuestion("");
          setPolitician(null);
          setCloseAt("");
          setSource("");
          setIsMulti(false);
          setOutcomes([
            { labelHe: "", politician: null, wasAuto: false },
            { labelHe: "", politician: null, wasAuto: false },
          ]);
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
      {/* 1. שאלת התחזית */}
      <div>
        <label className={LABEL} htmlFor="question">
          שאלת התחזית
        </label>
        <input
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, MAX_SUGGESTION_LEN))}
          required
          className={FIELD}
          placeholder="קצר וחד: ״מי יוביל את הליכוד בבחירות הבאות?״"
        />
        <p className="mt-1 text-start text-xs text-muted-foreground">
          <span className="nums">{remaining}</span> תווים נותרו · את אופן ההכרעה מפרטים למטה
        </p>
      </div>

      {/* 2. אפשרויות התשובה toggle */}
      <div>
        <span className={LABEL}>אפשרויות התשובה</span>
        <div className="flex gap-2" role="group" aria-label="סוג התחזית">
          <button
            type="button"
            onClick={() => setIsMulti(false)}
            aria-pressed={!isMulti}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold transition-all ${
              !isMulti
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary"
            }`}
          >
            כן / לא
          </button>
          <button
            type="button"
            onClick={() => setIsMulti(true)}
            aria-pressed={isMulti}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold transition-all ${
              isMulti
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary"
            }`}
          >
            כמה תשובות
          </button>
        </div>

        {/* 3. Multi outcome rows */}
        {isMulti && (
          <div className="mt-3 space-y-2">
            {outcomes.map((o, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="nums mt-2.5 w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <PoliticianCombobox
                    value={o.politician}
                    onChange={(p) => setOutcomePolitician(i, p)}
                    search={searchPoliticiansSuggestAction}
                    placeholder="פוליטיקאי (אופציונלי)"
                    label={`פוליטיקאי לתשובה ${i + 1}`}
                  />
                  <input
                    value={o.labelHe}
                    onChange={(e) => setOutcomeLabel(i, e.target.value.slice(0, MAX_OUTCOME_LABEL_LEN))}
                    className={FIELD}
                    placeholder="תווית התשובה"
                    aria-label={`תשובה ${i + 1}`}
                  />
                </div>
                {outcomes.length > MIN_OUTCOMES && (
                  <button
                    type="button"
                    onClick={() => setOutcomes((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`הסרת תשובה ${i + 1}`}
                    className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-negative hover:text-negative"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {outcomes.length < MAX_OUTCOMES && (
              <button
                type="button"
                onClick={() =>
                  setOutcomes((prev) => [...prev, { labelHe: "", politician: null, wasAuto: false }])
                }
                className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                + הוסיפו תשובה
              </button>
            )}
            <p className="text-xs text-muted-foreground">
              <span className="nums">{MIN_OUTCOMES}</span>–<span className="nums">{MAX_OUTCOMES}</span> תשובות;
              בחירת פוליטיקאי הופכת אותו לתשובה (כמו בשוק ״מי ירכיב את הממשלה״).
            </p>
          </div>
        )}
      </div>

      {/* 4. Details grid: קטגוריה + מתי השאלה תוכרע */}
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
            min={minLocal}
            value={closeAt}
            onChange={(e) => setCloseAt(e.target.value)}
            className={FIELD}
          />
        </div>
      </div>

      {/* 5. פוליטיקאי קשור — binary mode only (in multi, politicians live per-outcome) */}
      {!isMulti && (
        <div>
          <span className={LABEL}>פוליטיקאי קשור (לא חובה)</span>
          <PoliticianCombobox
            value={politician}
            onChange={setPolitician}
            search={searchPoliticiansSuggestAction}
            placeholder="חפשו פוליטיקאי…"
            label="פוליטיקאי קשור"
          />
        </div>
      )}

      {/* 6. מקור הכרעה */}
      <div>
        <label className={LABEL} htmlFor="source">
          מקור הכרעה (לא חובה)
        </label>
        <input
          id="source"
          value={source}
          onChange={(e) => setSource(e.target.value.slice(0, MAX_SOURCE_NOTE_LEN))}
          className={FIELD}
          placeholder="למשל: אתר הכנסת, פרסום ברשומות, הודעה רשמית…"
        />
      </div>

      {/* 7. Submit */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || question.trim().length === 0 || !closeAt || !multiReady}
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
