"use client";

// 3-stage "הצעה לסדר" wizard. The server actions (submit + politician search)
// are INJECTED as props rather than imported, so this exact component renders
// in both prod (app/suggest/page.tsx passes the real actions) and Storybook
// (passes noops) — no server bundle leaks into the client/story build.
//
// Step 1 שאלה · Step 2 אפשרויות התשובה · Step 3 פרטים והגשה. Motion drives the
// step transitions, the sliding progress indicator, and the staggered field
// reveal; all of it collapses to instant under prefers-reduced-motion.

import { useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PoliticianCombobox } from "@/components/politician-combobox";
import { CategoryChips } from "@/components/category-chips";
import { DateTimeField } from "@/components/date-time-field";
import type { PoliticianOption } from "@/lib/types";
import type { ActionResult } from "@/app/actions/types";
import { nowLocalInput } from "@/lib/time";
import { useHydrated } from "@/lib/use-hydrated";

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
  wasAuto: boolean;
}

export interface SuggestMarketWizardProps {
  categories: { key: string; he: string }[];
  defaultPolitician?: PoliticianOption | null;
  /** Server action (or a story noop) — searches politicians for the comboboxes. */
  searchPoliticians: (args: { q: string }) => Promise<PoliticianOption[]>;
  /** Server action (or a story noop) — submits the proposal. */
  onSubmit: (args: {
    questionHe: string;
    category: string;
    personId?: number | null;
    outcomes?: { labelHe: string; personId?: number | null }[] | null;
    proposedCloseAt: string;
    resolutionSourceNote?: string | null;
  }) => Promise<ActionResult>;
}

const STEPS = [
  { key: "question", he: "השאלה" },
  { key: "answers", he: "אפשרויות התשובה" },
  { key: "details", he: "פרטים והגשה" },
] as const;

export function SuggestMarketWizard({
  categories,
  defaultPolitician,
  searchPoliticians,
  onSubmit,
}: SuggestMarketWizardProps) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1); // 1 = forward, -1 = back (drives slide direction)

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

  const hydrated = useHydrated();
  const minLocal = hydrated ? nowLocalInput() : undefined;
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  // --- outcome label auto-fill (verbatim from the original form's contract) ---
  function setOutcomePolitician(i: number, p: PoliticianOption | null) {
    setOutcomes((prev) =>
      prev.map((o, j) => {
        if (j !== i) return o;
        if (p) {
          const autoLabel = p.nameHe.slice(0, MAX_OUTCOME_LABEL_LEN);
          const shouldFill = !o.labelHe || o.wasAuto;
          return { ...o, politician: p, labelHe: shouldFill ? autoLabel : o.labelHe, wasAuto: shouldFill };
        }
        return { ...o, politician: null };
      }),
    );
  }
  function setOutcomeLabel(i: number, text: string) {
    setOutcomes((prev) => prev.map((o, j) => (j === i ? { ...o, labelHe: text, wasAuto: false } : o)));
  }

  const validOutcomes = outcomes.filter((o) => o.labelHe.trim().length > 0);
  const multiReady = !isMulti || validOutcomes.length >= MIN_OUTCOMES;
  const remaining = MAX_SUGGESTION_LEN - question.length;

  // Per-step gate for the "next" button (and overall readiness for submit).
  const canAdvance = [question.trim().length > 0, multiReady, Boolean(closeAt)][step];
  const canSubmit = question.trim().length > 0 && Boolean(closeAt) && multiReady;

  function go(next: number) {
    setDir(next > step ? 1 : -1);
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await onSubmit({
          questionHe: question,
          category,
          personId: isMulti ? null : (politician?.personId ?? null),
          outcomes: isMulti
            ? validOutcomes.map((o) => ({ labelHe: o.labelHe.trim(), personId: o.politician?.personId ?? null }))
            : null,
          proposedCloseAt: new Date(closeAt).toISOString(),
          resolutionSourceNote: source.trim() || null,
        });
        setOk(res.ok);
        setMessage(res.message ?? (res.ok ? "נשלח" : "שגיאה"));
        if (res.ok) {
          setQuestion(""); setPolitician(null); setCloseAt(""); setSource(""); setIsMulti(false);
          setOutcomes([
            { labelHe: "", politician: null, wasAuto: false },
            { labelHe: "", politician: null, wasAuto: false },
          ]);
          setStep(0);
        }
      } catch {
        setOk(false);
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  // Slide+fade between steps. mode="wait" serializes exit→enter, so keep each
  // leg SHORT (a snappy tween, not a settling spring) — otherwise the nav
  // button flips to the next step while the old content is still leaving.
  // Instant when reduced-motion is on.
  const variants = {
    enter: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * 40 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * -40 }),
  };
  const stepTransition = reduce ? { duration: 0.1 } : { duration: 0.18, ease: "easeOut" as const };
  const fieldStagger = {
    center: { transition: reduce ? {} : { staggerChildren: 0.06, delayChildren: 0.04 } },
  };
  const fieldItem = {
    enter: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
    center: { opacity: 1, y: 0 },
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <Stepper step={step} reduce={reduce} onJump={(i) => i < step && go(i)} />

      <div className="px-5 pb-5 pt-4">
        {/* min-height keeps the nav from jumping as step content changes height */}
        <div className="relative min-h-[15rem]">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepTransition}
            >
              <motion.div variants={fieldStagger} initial={false} animate="center" className="space-y-4">
                {step === 0 && (
                  <motion.div variants={fieldItem}>
                    <label className={LABEL} htmlFor="wq">שאלת התחזית</label>
                    <input
                      id="wq"
                      autoFocus
                      value={question}
                      onChange={(e) => setQuestion(e.target.value.slice(0, MAX_SUGGESTION_LEN))}
                      className={`${FIELD} text-base`}
                      placeholder="קצר וחד: ״מי יוביל את הליכוד בבחירות הבאות?״"
                    />
                    <p className="mt-1.5 text-start text-xs text-muted-foreground">
                      <span className={`nums font-semibold ${remaining < 20 ? "text-negative" : ""}`}>{remaining}</span>{" "}
                      תווים נותרו · נסחו שאלה שאפשר להכריע חד-משמעית ממקור רשמי
                    </p>
                  </motion.div>
                )}

                {step === 1 && (
                  <>
                    <motion.div variants={fieldItem}>
                      <span className={LABEL}>איך עונים על השאלה?</span>
                      <div className="grid grid-cols-2 gap-2" role="group" aria-label="סוג התחזית">
                        {[{ m: false, t: "כן / לא" }, { m: true, t: "כמה תשובות" }].map(({ m, t }) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setIsMulti(m)}
                            aria-pressed={isMulti === m}
                            className={`rounded-xl border-2 py-3 font-bold transition-colors ${
                              isMulti === m
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </motion.div>

                    <AnimatePresence initial={false}>
                      {isMulti && (
                        <motion.div
                          key="rows"
                          initial={reduce ? false : { opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="space-y-2 overflow-hidden"
                        >
                          {outcomes.map((o, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="nums mt-2.5 w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                                <input
                                  value={o.labelHe}
                                  onChange={(e) => setOutcomeLabel(i, e.target.value.slice(0, MAX_OUTCOME_LABEL_LEN))}
                                  className={`${FIELD} min-w-40 flex-1`}
                                  placeholder="תשובה (או בחרו פוליטיקאי ←)"
                                  aria-label={`תשובה ${i + 1}`}
                                />
                                <div className="min-w-44 flex-1 sm:max-w-56">
                                  <PoliticianCombobox
                                    value={o.politician}
                                    onChange={(p) => setOutcomePolitician(i, p)}
                                    search={searchPoliticians}
                                    placeholder="פוליטיקאי (אופציונלי)"
                                    label={`פוליטיקאי לתשובה ${i + 1}`}
                                  />
                                </div>
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
                              onClick={() => setOutcomes((prev) => [...prev, { labelHe: "", politician: null, wasAuto: false }])}
                              className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                            >
                              + הוסיפו תשובה
                            </button>
                          )}
                          <p className="text-xs text-muted-foreground">
                            <span className="nums">{MIN_OUTCOMES}</span>–<span className="nums">{MAX_OUTCOMES}</span> תשובות; בחירת פוליטיקאי הופכת אותו לתשובה.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}

                {step === 2 && (
                  <>
                    <motion.div variants={fieldItem}>
                      <span className={LABEL}>קטגוריה</span>
                      <CategoryChips categories={categories} value={category} onChange={setCategory} />
                    </motion.div>

                    <motion.div variants={fieldItem}>
                      <span className={LABEL}>מתי השאלה תוכרע?</span>
                      <DateTimeField value={closeAt} onChange={setCloseAt} min={minLocal} />
                    </motion.div>

                    {!isMulti && (
                      <motion.div variants={fieldItem}>
                        <span className={LABEL}>פוליטיקאי קשור (לא חובה)</span>
                        <PoliticianCombobox
                          value={politician}
                          onChange={setPolitician}
                          search={searchPoliticians}
                          placeholder="חפשו פוליטיקאי…"
                          label="פוליטיקאי קשור"
                        />
                      </motion.div>
                    )}

                    <motion.div variants={fieldItem}>
                      <label className={LABEL} htmlFor="wsrc">מקור הכרעה (לא חובה)</label>
                      <input
                        id="wsrc" value={source}
                        onChange={(e) => setSource(e.target.value.slice(0, MAX_SOURCE_NOTE_LEN))}
                        className={FIELD}
                        placeholder="למשל: אתר הכנסת, פרסום ברשומות, הודעה רשמית…"
                      />
                    </motion.div>
                  </>
                )}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* nav */}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => go(step - 1)}
              className="rounded-lg px-4 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              → הקודם
            </button>
          ) : (
            <span />
          )}

          {step < STEPS.length - 1 ? (
            <motion.button
              type="button"
              onClick={() => canAdvance && go(step + 1)}
              disabled={!canAdvance}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              className="rounded-lg bg-primary px-6 py-2.5 font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              הבא ←
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={submit}
              disabled={pending || !canSubmit}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              className="rounded-lg bg-accent px-6 py-2.5 font-display text-base font-black text-accent-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {pending ? "מגישים…" : "הגישו הצעה לסדר"}
            </motion.button>
          )}
        </div>

        <AnimatePresence>
          {message && (
            <motion.p
              role="status"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mt-3 text-center text-sm font-semibold ${ok ? "text-positive" : "text-negative"}`}
            >
              {message}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Top progress rail: numbered pills + a sliding mint indicator (layoutId). */
function Stepper({ step, reduce, onJump }: { step: number; reduce: boolean | null; onJump: (i: number) => void }) {
  return (
    <ol className="flex items-stretch border-b border-border" aria-label="שלבי ההצעה">
      {STEPS.map((s, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <li key={s.key} className="relative flex-1">
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={i >= step}
              aria-current={active ? "step" : undefined}
              className={`flex w-full items-center justify-center gap-2 px-2 py-3 text-sm font-bold transition-colors ${
                active ? "text-primary" : done ? "text-foreground hover:text-primary" : "text-muted-foreground"
              } ${i < step ? "cursor-pointer" : "cursor-default"}`}
            >
              <span
                className={`nums grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${
                  active || done ? "bg-primary text-primary-foreground" : "border border-border"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className="hidden sm:inline">{s.he}</span>
            </button>
            {active && (
              <motion.span
                layoutId="wizard-underline"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }}
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
