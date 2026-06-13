"use client";

// ⚠️ THROWAWAY BRAINSTORM PROTOTYPE — the two "next button" behaviors:
//   C. CtaPeekProto  — answer → confirmation + teaser of the next question +
//                      a big "לשאלה הבאה" button that NAVIGATES (full page)
//   D. CarouselProto — answer → next button swaps the question card IN PLACE
//                      (page content below stays — the trade-off on display)

import { useState } from "react";
import {
  PageFiller,
  PROTO_QUESTIONS,
  ProtoStyles,
  QuestionCard,
  StreakChip,
  type ProtoQuestion,
} from "./proto-shared";

interface ProtoFlowProps {
  questions?: ProtoQuestion[];
}

/* ------------------------------------------------------------------ */
/* Variant C — CTA + peek, real navigation                            */
/* ------------------------------------------------------------------ */

export function CtaPeekProto({ questions = PROTO_QUESTIONS }: ProtoFlowProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [navigating, setNavigating] = useState(false);

  const question = questions[index];
  const next = questions[index + 1] ?? null;
  const answered = answers[question.id] != null;
  const answeredCount = Object.keys(answers).length;

  function goNext() {
    if (!next) return;
    setNavigating(true);
    // simulates a real <Link> navigation to /vote/:id or /market/:id
    window.setTimeout(() => {
      setIndex((cur) => cur + 1);
      setNavigating(false);
      window.scrollTo({ top: 0 });
    }, 350);
  }

  if (navigating) {
    return (
      <div className="py-24 text-center text-sm text-muted-foreground">
        <ProtoStyles />
        טוען את העמוד הבא…
      </div>
    );
  }

  return (
    // key re-mounts the whole "page" — this is a navigation, not a swap
    <div key={question.id} className="proto-fade">
      <ProtoStyles />
      <h2 className="mb-3 font-display text-xl text-foreground">וריאנט C — כפתור ממשיך + הצצה</h2>
      <QuestionCard
        question={question}
        answerId={answers[question.id] ?? null}
        onAnswer={(optionId) => setAnswers((cur) => ({ ...cur, [question.id]: optionId }))}
      />

      {answered && (
        <div className="proto-rise mt-3 rounded-card border border-primary bg-card p-4 shadow-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground">
              {next ? "הבא בתור:" : "זהו, בינתיים:"}
            </p>
            <StreakChip count={answeredCount} />
          </div>
          {next ? (
            <>
              <p className="mb-0.5 text-xs font-semibold text-muted-foreground">{next.chip}</p>
              <p className="mb-3 truncate text-sm font-extrabold text-foreground">{next.title}</p>
              <button
                type="button"
                onClick={goNext}
                className="w-full rounded-[12px] bg-primary py-3 font-extrabold text-primary-foreground transition-all duration-150 hover:bg-primary-hover hover:shadow-glow-mint"
              >
                לשאלה הבאה ←
              </button>
            </>
          ) : (
            <p className="text-center text-sm font-bold text-foreground">🎉 עניתם על הכול — חזרה לפיד</p>
          )}
        </div>
      )}

      <PageFiller label={`פילוח לפי סיעות — ${question.title.slice(0, 24)}…`} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant D — in-place carousel swap (no navigation)                 */
/* ------------------------------------------------------------------ */

export function CarouselProto({ questions = PROTO_QUESTIONS }: ProtoFlowProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const question = questions[index];
  const answered = answers[question.id] != null;
  const answeredCount = Object.keys(answers).length;
  const hasNext = index + 1 < questions.length;

  return (
    <div>
      <ProtoStyles />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl text-foreground">וריאנט D — החלפה במקום</h2>
        <StreakChip count={answeredCount} />
      </div>

      {/* key re-mounts JUST the card — the rest of the page stays put */}
      <div key={question.id} className="proto-slide">
        <QuestionCard
          question={question}
          answerId={answers[question.id] ?? null}
          onAnswer={(optionId) => setAnswers((cur) => ({ ...cur, [question.id]: optionId }))}
        />
      </div>

      <div className="mt-3 flex items-center justify-between rounded-card border border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-1.5" aria-label={`שאלה ${index + 1} מתוך ${questions.length}`}>
          {questions.map((q, i) => (
            <span
              key={q.id}
              aria-hidden
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-5 bg-primary" : answers[q.id] != null ? "w-1.5 bg-positive" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-primary">לעמוד המלא ←</span>
          {hasNext ? (
            <button
              type="button"
              onClick={() => setIndex((cur) => cur + 1)}
              className={`rounded-[12px] px-4 py-2 text-sm font-extrabold transition-all duration-150 ${
                answered
                  ? "bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-glow-mint"
                  : "border border-border bg-sunken text-muted-foreground"
              }`}
            >
              {answered ? "הבאה ←" : "דלגו ←"}
            </button>
          ) : (
            <span className="text-sm font-bold text-foreground">🎉 סיימתם</span>
          )}
        </div>
      </div>

      {/* the honest trade-off: this content still belongs to the FIRST question */}
      <PageFiller label={`פילוח לפי סיעות — ${questions[0].title.slice(0, 24)}…`} />
    </div>
  );
}
