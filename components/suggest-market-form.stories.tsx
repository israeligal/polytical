"use client";

/**
 * Story renders a standalone demo that mirrors suggest-market-form.tsx
 * visually and interactively, but swaps the real server action for a noop
 * so Storybook doesn't pull in the Neon/Drizzle server bundle (Buffer).
 */

import { useState, useTransition } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const MAX_LEN = 100;
const MAX_OUTCOME_LEN = 40;
const MIN_OUTCOMES = 2;
const MAX_OUTCOMES = 8;

const FIELD =
  "w-full rounded-xl border-2 border-border bg-sunken px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none";
const LABEL = "mb-1.5 block font-accent text-xs font-bold text-muted-foreground";

const CATS = [
  { key: "coalition", he: "קואליציה" },
  { key: "opposition", he: "אופוזיציה" },
  { key: "legislation", he: "חקיקה" },
  { key: "foreign", he: "ביטחון וחוץ" },
  { key: "economy", he: "כלכלה" },
];

const POLS = [
  { personId: 1, name: "בנימין נתניהו" },
  { personId: 2, name: "יאיר לפיד" },
  { personId: 3, name: "בני גנץ" },
  { personId: 4, name: "יצחק הרצוג" },
  { personId: 5, name: "ניר ברקת" },
];

function SectionCard({
  letter,
  title,
  tone,
  children,
}: {
  letter: string;
  title: string;
  tone: "accent" | "primary" | "positive";
  children: React.ReactNode;
}) {
  const stripe = {
    accent:   "border-s-accent   bg-accent/5   text-accent",
    primary:  "border-s-primary  bg-primary/5  text-primary",
    positive: "border-s-positive bg-positive/5 text-positive",
  }[tone];
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2">
      <div className={`border-s-4 px-5 py-3 ${stripe}`}>
        <p className="mb-0.5 font-accent text-xs font-bold uppercase tracking-widest">{letter}</p>
        <h2 className="font-display text-lg font-black text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function DemoForm({ defaultPersonId }: { defaultPersonId?: number }) {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("coalition");
  const [personId, setPersonId] = useState(defaultPersonId ? String(defaultPersonId) : "");
  const [closeAt, setCloseAt] = useState("");
  const [source, setSource] = useState("");
  const [isMulti, setIsMulti] = useState(false);
  const [outcomes, setOutcomes] = useState([
    { labelHe: "", personId: "" },
    { labelHe: "", personId: "" },
  ]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nameById = new Map(POLS.map((p) => [String(p.personId), p.name]));

  function setOutcome(i: number, patch: Partial<{ labelHe: string; personId: string }>) {
    setOutcomes((prev) =>
      prev.map((o, j) => {
        if (j !== i) return o;
        const next = { ...o, ...patch };
        if (patch.personId && patch.personId) {
          const name = nameById.get(patch.personId) ?? "";
          const wasAuto = !o.labelHe || o.labelHe === nameById.get(o.personId);
          if (wasAuto && name) next.labelHe = name.slice(0, MAX_OUTCOME_LEN);
        }
        return next;
      }),
    );
  }

  const validOutcomes = outcomes.filter((o) => o.labelHe.trim().length > 0);
  const multiReady = !isMulti || validOutcomes.length >= MIN_OUTCOMES;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 600));
      setMessage("ההצעה נשלחה לבדיקה (הדגמה)");
    });
  }

  const remaining = MAX_LEN - question.length;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <SectionCard letter="א" title="שאלת התחזית" tone="accent">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, MAX_LEN))}
          required
          className={FIELD}
          placeholder="קצר וחד: ״מי יוביל את הליכוד בבחירות הבאות?״"
        />
        <p className="mt-2 text-end text-xs text-muted-foreground">
          <span className={`nums font-semibold ${remaining < 20 ? "text-negative" : ""}`}>{remaining}</span>{" "}
          תווים נותרו · את אופן ההכרעה מפרטים למטה
        </p>
      </SectionCard>

      <SectionCard letter="ב" title="אפשרויות תשובה" tone="primary">
        <div className="grid grid-cols-2 gap-3" role="group">
          {["כן / לא", "כמה תשובות"].map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setIsMulti(i === 1)}
              aria-pressed={isMulti === (i === 1)}
              className={`rounded-xl border-2 py-3 font-bold transition-all ${
                isMulti === (i === 1)
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isMulti && (
          <div className="mt-4 space-y-2">
            {outcomes.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="nums w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                <input
                  value={o.labelHe}
                  onChange={(e) => setOutcome(i, { labelHe: e.target.value.slice(0, MAX_OUTCOME_LEN) })}
                  className={FIELD}
                  placeholder="תשובה (או בחרו פוליטיקאי ←)"
                  aria-label={`תשובה ${i + 1}`}
                />
                <select
                  value={o.personId}
                  onChange={(e) => setOutcome(i, { personId: e.target.value })}
                  className={`${FIELD} max-w-44 shrink-0`}
                >
                  <option value="">ללא פוליטיקאי</option>
                  {POLS.map((p) => (
                    <option key={p.personId} value={p.personId}>{p.name}</option>
                  ))}
                </select>
                {outcomes.length > MIN_OUTCOMES && (
                  <button
                    type="button"
                    onClick={() => setOutcomes((prev) => prev.filter((_, j) => j !== i))}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-border text-muted-foreground transition-colors hover:border-negative hover:text-negative"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {outcomes.length < MAX_OUTCOMES && (
              <button
                type="button"
                onClick={() => setOutcomes((prev) => [...prev, { labelHe: "", personId: "" }])}
                className="w-full rounded-xl border-2 border-dashed border-border px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                + הוסיפו תשובה
              </button>
            )}
            <p className="text-xs text-muted-foreground">
              <span className="nums">{MIN_OUTCOMES}</span>–<span className="nums">{MAX_OUTCOMES}</span>{" "}
              תשובות; בחירת פוליטיקאי הופכת אותו לתשובה.
            </p>
          </div>
        )}
      </SectionCard>

      <SectionCard letter="ג" title="פרטי ההצעה" tone="positive">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL}>קטגוריה</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={FIELD}>
              {CATS.map((c) => <option key={c.key} value={c.key}>{c.he}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>מתי השאלה תוכרע?</label>
            <input
              type="datetime-local"
              dir="ltr"
              required
              value={closeAt}
              onChange={(e) => setCloseAt(e.target.value)}
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL}>
              פוליטיקאי קשור <span className="font-normal opacity-50">· לא חובה</span>
            </label>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)} className={FIELD}>
              <option value="">ללא</option>
              {POLS.map((p) => <option key={p.personId} value={p.personId}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>
              מקור הכרעה <span className="font-normal opacity-50">· לא חובה</span>
            </label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value.slice(0, 300))}
              className={FIELD}
              placeholder="למשל: אתר הכנסת, פרסום ברשומות…"
            />
          </div>
        </div>
      </SectionCard>

      <button
        type="submit"
        disabled={pending || !question.trim() || !closeAt || !multiReady}
        className="w-full rounded-2xl bg-accent py-4 font-display text-xl font-black text-accent-foreground shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-40"
      >
        {pending ? "מגישים…" : "הגישו הצעה לסדר"}
      </button>
      {message && (
        <p role="status" className="text-center text-sm font-semibold text-positive">{message}</p>
      )}
    </form>
  );
}

const meta = {
  title: "Forms/SuggestMarket — Single-Page (sectioned)",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <DemoForm />
    </div>
  ),
};

export const WithPreselectedPolitician: Story = {
  render: () => (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <DemoForm defaultPersonId={1} />
    </div>
  ),
};
