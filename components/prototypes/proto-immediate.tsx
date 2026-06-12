"use client";

// ⚠️ THROWAWAY BRAINSTORM PROTOTYPE — the two "immediate" behaviors:
//   A. InlineStackProto  — next question slides in under the answered one
//   B. BottomSheetProto  — next question rises as a thumb-zone bottom sheet
// Plus the desktop adaptation (DesktopRailProto — "next up" in the 320px rail).

import { useRef, useState } from "react";
import {
  AnsweredStrip,
  PageFiller,
  PROTO_QUESTIONS,
  ProtoStyles,
  QuestionCard,
  StreakChip,
  type ProtoQuestion,
} from "./proto-shared";

const ADVANCE_MS = 700;

interface ProtoFlowProps {
  questions?: ProtoQuestion[];
}

/* ------------------------------------------------------------------ */
/* Variant A — inline stack: answer → card compresses → next rises    */
/* ------------------------------------------------------------------ */

export function InlineStackProto({ questions = PROTO_QUESTIONS }: ProtoFlowProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(1);
  const newest = useRef<HTMLDivElement>(null);

  const answeredCount = Object.keys(answers).length;
  const done = answeredCount >= questions.length;

  function answer({ question, optionId }: { question: ProtoQuestion; optionId: string }) {
    const isFirstAnswer = answers[question.id] == null;
    setAnswers((cur) => ({ ...cur, [question.id]: optionId }));
    if (!isFirstAnswer) return; // changing your pick doesn't re-advance
    window.setTimeout(() => {
      setVisible((cur) => Math.min(cur + 1, questions.length));
      newest.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, ADVANCE_MS);
  }

  return (
    <div>
      <ProtoStyles />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl text-foreground">וריאנט A — ערימה במקום</h2>
        <StreakChip count={answeredCount} />
      </div>
      <div className="space-y-3">
        {questions.slice(0, visible).map((q, i) => {
          const answerId = answers[q.id] ?? null;
          const isNewest = i === visible - 1;
          // answered cards collapse to a strip once a newer card exists
          if (answerId != null && !isNewest) {
            return <AnsweredStrip key={q.id} question={q} answerId={answerId} />;
          }
          return (
            <div key={q.id} ref={isNewest ? newest : undefined} className={i > 0 ? "proto-rise" : undefined}>
              <QuestionCard
                question={q}
                answerId={answerId}
                onAnswer={(optionId) => answer({ question: q, optionId })}
                eyebrow={i > 0 ? "השאלה הבאה" : undefined}
              />
            </div>
          );
        })}
        {done && (
          <p className="proto-rise rounded-card border border-primary bg-card p-4 text-center text-sm font-bold text-foreground">
            🎉 עניתם על הכול — <span className="text-primary">חזרה לפיד</span>
          </p>
        )}
      </div>
      <PageFiller />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant B — bottom sheet: answer → sheet rises with the next one   */
/* ------------------------------------------------------------------ */

export function BottomSheetProto({ questions = PROTO_QUESTIONS }: ProtoFlowProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sheetIndex, setSheetIndex] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const page = questions[0];
  const sheetQuestion = sheetIndex != null ? questions[sheetIndex] : null;
  const answeredCount = Object.keys(answers).length;

  function answer({ question, optionId, index }: { question: ProtoQuestion; optionId: string; index: number }) {
    const isFirstAnswer = answers[question.id] == null;
    setAnswers((cur) => ({ ...cur, [question.id]: optionId }));
    if (!isFirstAnswer) return;
    window.setTimeout(() => {
      const next = index + 1;
      if (next < questions.length) setSheetIndex(next);
      else setSheetIndex(null);
    }, ADVANCE_MS);
  }

  return (
    <div>
      <ProtoStyles />
      <h2 className="mb-3 font-display text-xl text-foreground">וריאנט B — מגירה תחתונה</h2>
      <QuestionCard
        question={page}
        answerId={answers[page.id] ?? null}
        onAnswer={(optionId) => answer({ question: page, optionId, index: 0 })}
      />
      <PageFiller />

      {sheetQuestion && !dismissed && (
        <>
          <div
            aria-hidden
            className="proto-fade fixed inset-0 bg-foreground/25"
            onClick={() => setDismissed(true)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="עוד שאלות בשבילכם"
            className="proto-sheet fixed inset-x-0 bottom-0 rounded-t-[20px] border-t border-border bg-card p-4 pb-6 shadow-2"
          >
            <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">
                עוד שאלות בשבילכם <StreakChip count={answeredCount} />
              </p>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                aria-label="סגירה"
                className="rounded-full px-2 text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            {/* key re-mounts the card so each next question animates in */}
            <div key={sheetQuestion.id} className="proto-rise">
              <QuestionCard
                question={sheetQuestion}
                answerId={answers[sheetQuestion.id] ?? null}
                onAnswer={(optionId) =>
                  answer({ question: sheetQuestion, optionId, index: sheetIndex ?? 0 })
                }
                flat
              />
              <p className="mt-2 text-center text-xs font-bold text-primary">לעמוד המלא של השאלה ←</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop adaptation — "next up" spotlight in the existing 320px rail */
/* ------------------------------------------------------------------ */

export function DesktopRailProto({ questions = PROTO_QUESTIONS }: ProtoFlowProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [railIndex, setRailIndex] = useState<number | null>(null);

  const page = questions[0];
  const railQuestion = railIndex != null ? questions[railIndex] : null;
  const answeredCount = Object.keys(answers).length;

  function answer({ question, optionId, index }: { question: ProtoQuestion; optionId: string; index: number }) {
    const isFirstAnswer = answers[question.id] == null;
    setAnswers((cur) => ({ ...cur, [question.id]: optionId }));
    if (!isFirstAnswer) return;
    window.setTimeout(() => {
      const next = index + 1;
      setRailIndex(next < questions.length ? next : null);
    }, ADVANCE_MS);
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <ProtoStyles />
      <h2 className="mb-3 font-display text-xl text-foreground">דסקטופ — ״הבא בתור״ ברייל הצדדי</h2>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <QuestionCard
            question={page}
            answerId={answers[page.id] ?? null}
            onAnswer={(optionId) => answer({ question: page, optionId, index: 0 })}
          />
          <PageFiller />
        </div>
        <aside className="space-y-3">
          <div className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground shadow-2">
            איך מכריעים? (הקלף הקיים)
          </div>
          {railQuestion ? (
            <div key={railQuestion.id} className="proto-rise">
              <div className="rounded-card border-2 border-primary bg-card p-4 shadow-glow-mint">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-bold text-primary">הבא בתור</p>
                  <StreakChip count={answeredCount} />
                </div>
                <QuestionCard
                  question={railQuestion}
                  answerId={answers[railQuestion.id] ?? null}
                  onAnswer={(optionId) =>
                    answer({ question: railQuestion, optionId, index: railIndex ?? 0 })
                  }
                  flat
                />
              </div>
            </div>
          ) : answeredCount > 0 ? (
            <p className="proto-rise rounded-card border border-primary bg-card p-4 text-center text-sm font-bold text-foreground">
              🎉 עניתם על הכול
            </p>
          ) : (
            <div className="rounded-card border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              (אחרי שתענו — השאלה הבאה תופיע כאן)
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
