"use client";

// ⚠️ THROWAWAY BRAINSTORM PROTOTYPE — variant E (the chosen mobile direction):
// a swipeable card deck. Swiping the card toward a side casts that side's
// answer — RTL button placement: right = כן/בעד (positive), left = לא/נגד
// (negative) — with a progressive tint + ghost label while dragging. Tapping
// the Design-1 buttons also casts (then auto-advances). Back/next mini-nav
// revisits answered cards, which stay editable and link to their full page.
// Multi-choice cards are tap-to-answer; swiping them only navigates.

import { useRef, useState } from "react";
import {
  PageFiller,
  PROTO_QUESTIONS,
  ProtoStyles,
  QuestionBody,
  StreakChip,
  type ProtoQuestion,
} from "./proto-shared";

const CAST_PX = 90; // horizontal travel that commits an answer
const LOCK_PX = 8; // movement before the gesture axis is decided
const FLY_MS = 280;

type FlyDir = -1 | 0 | 1;
type Axis = "h" | "v" | null;

interface SwipeDeckProps {
  questions?: ProtoQuestion[];
}

interface SwipeIntent {
  kind: "cast" | "nav" | "none";
  label: string;
  overlayCls: string;
  optionId?: string;
}

function deriveIntent({
  question,
  answered,
  dx,
}: {
  question: ProtoQuestion;
  answered: boolean;
  dx: number;
}): SwipeIntent {
  if (dx === 0) return { kind: "none", label: "", overlayCls: "" };
  const castable = question.kind !== "multi" && !answered;
  if (castable) {
    // options[0] is the positive/right button in RTL, options[1] the negative/left
    const option = dx > 0 ? question.options[0] : question.options[1];
    return {
      kind: "cast",
      label: option.label,
      overlayCls: dx > 0 ? "bg-positive" : "bg-negative",
      optionId: option.id,
    };
  }
  return {
    kind: "nav",
    label: dx < 0 ? "הבאה ←" : "→ הקודמת",
    overlayCls: "bg-raised",
  };
}

export function SwipeDeckProto({ questions = PROTO_QUESTIONS }: SwipeDeckProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flyDir, setFlyDir] = useState<FlyDir>(0);
  const start = useRef({ x: 0, y: 0 });
  const axis = useRef<Axis>(null);
  const moved = useRef(false);

  const total = questions.length;
  const atEnd = index >= total; // the celebration card position
  const question = atEnd ? null : questions[index];
  const answerId = question ? (answers[question.id] ?? null) : null;
  const answeredCount = Object.keys(answers).length;
  const peek = index + 1 < total ? questions[index + 1] : null;

  const intent = question
    ? deriveIntent({ question, answered: answerId != null, dx })
    : ({ kind: "none", label: "", overlayCls: "" } as SwipeIntent);

  function flyoutThenGo({ dir, nextIndex }: { dir: FlyDir; nextIndex: number }) {
    setFlyDir(dir);
    window.setTimeout(() => {
      setIndex(nextIndex);
      setFlyDir(0);
      setDx(0);
      setDragging(false);
    }, FLY_MS);
  }

  function cast({ q, optionId, viaSwipe }: { q: ProtoQuestion; optionId: string; viaSwipe: boolean }) {
    if (!viaSwipe && moved.current) return; // a drag release must not double as a tap
    const isFirstAnswer = answers[q.id] == null;
    setAnswers((cur) => ({ ...cur, [q.id]: optionId }));
    if (!isFirstAnswer) return; // changing your pick on a revisit doesn't advance
    const positive = optionId === q.options[0].id;
    const dir: FlyDir = positive ? 1 : -1;
    if (viaSwipe) flyoutThenGo({ dir, nextIndex: index + 1 });
    else window.setTimeout(() => flyoutThenGo({ dir, nextIndex: index + 1 }), 520);
  }

  function navigate(step: 1 | -1) {
    const nextIndex = index + step;
    if (nextIndex < 0 || nextIndex > total) return;
    // fly toward the physical drag direction: next exits left, back exits right
    flyoutThenGo({ dir: step === 1 ? -1 : 1, nextIndex });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (flyDir !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    moved.current = false;
    // NOTE: no setPointerCapture here — capturing on pointerdown would retarget
    // the eventual `click` to the card and swallow plain button taps.
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (flyDir !== 0) return;
    const ddx = e.clientX - start.current.x;
    const ddy = e.clientY - start.current.y;
    if (axis.current == null) {
      if (Math.abs(ddx) < LOCK_PX && Math.abs(ddy) < LOCK_PX) return;
      axis.current = Math.abs(ddx) > Math.abs(ddy) ? "h" : "v";
      if (axis.current === "h") {
        try {
          e.currentTarget.setPointerCapture(e.pointerId); // capture only once it IS a swipe
        } catch {
          /* synthetic pointers in tests can't be captured */
        }
      }
    }
    if (axis.current !== "h") return; // vertical = native scroll, leave it alone
    moved.current = true;
    setDragging(true);
    setDx(ddx);
  }

  function onPointerUp() {
    if (axis.current !== "h" || flyDir !== 0) {
      setDragging(false);
      return;
    }
    const release = dx;
    axis.current = null;
    if (Math.abs(release) < CAST_PX || !question) {
      setDx(0); // spring back
      setDragging(false);
      return;
    }
    const releaseIntent = deriveIntent({ question, answered: answerId != null, dx: release });
    if (releaseIntent.kind === "cast" && releaseIntent.optionId) {
      cast({ q: question, optionId: releaseIntent.optionId, viaSwipe: true });
      setFlyDir(release > 0 ? 1 : -1); // cast() schedules the advance; mirror the dir now
    } else if (releaseIntent.kind === "nav") {
      if (release < 0) navigate(1);
      else navigate(-1);
    }
  }

  const cardTransform = dragging
    ? `translateX(${dx}px) rotate(${dx * 0.05}deg)`
    : flyDir !== 0
      ? `translateX(${flyDir * 130}%) rotate(${flyDir * 14}deg)`
      : "none";

  return (
    <div>
      <ProtoStyles />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl text-foreground">וריאנט E — דק קלפים + סוויפ</h2>
        <StreakChip count={answeredCount} />
      </div>

      <div className="relative">
        {/* the next card peeking from behind (deck illusion) */}
        {peek && flyDir === 0 && (
          <div
            aria-hidden
            className="absolute inset-0 translate-y-2.5 scale-x-[.96] overflow-hidden rounded-card border border-border bg-card p-4 opacity-60"
          >
            <p className="text-xs font-semibold text-muted-foreground">{peek.chip}</p>
            <p className="truncate font-display text-lg text-foreground">{peek.title}</p>
          </div>
        )}

        {atEnd ? (
          <div className="proto-rise relative rounded-card border border-primary bg-card p-6 text-center shadow-2">
            <p className="font-display text-xl text-foreground">🎉 עניתם על הכול</p>
            <p className="mt-2 text-sm font-bold text-primary">חזרה לפיד ←</p>
          </div>
        ) : question ? (
          <div
            key={question.id}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{ transform: cardTransform, touchAction: "pan-y" }}
            className={`relative select-none overflow-hidden rounded-card border border-border bg-card p-4 shadow-2 ${
              dragging ? "cursor-grabbing" : "transition-[transform,opacity] duration-300 ease-out"
            } ${flyDir !== 0 ? "opacity-0" : ""}`}
          >
            {/* progressive tint + ghost label while dragging */}
            {intent.kind !== "none" && dragging && (
              <>
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-0 ${intent.overlayCls}`}
                  style={{ opacity: Math.min(Math.abs(dx) / 200, 0.4) }}
                />
                <p
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-4xl font-black text-foreground"
                  style={{ opacity: Math.min(Math.abs(dx) / 110, 1) }}
                >
                  {intent.label}
                </p>
              </>
            )}

            <p className="mb-1 text-xs font-semibold text-muted-foreground">{question.chip}</p>
            <h3 className="mb-3 font-display text-lg leading-snug text-foreground">{question.title}</h3>
            <QuestionBody
              question={question}
              answerId={answerId}
              onAnswer={(optionId) => cast({ q: question, optionId, viaSwipe: false })}
            />
            <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
              <span className="text-xs font-bold text-primary">לעמוד המלא ←</span>
              {question.kind !== "multi" && answerId == null ? (
                <span className="text-[11px] text-muted-foreground">
                  או החליקו — ימינה {question.options[0].label} · שמאלה {question.options[1].label}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">החלקה מדפדפת</span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* back / progress / next */}
      <div className="mt-3 flex items-center justify-between rounded-card border border-border bg-card px-3 py-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          disabled={index === 0 || flyDir !== 0}
          className="rounded-full border border-border bg-sunken px-3 py-1.5 text-xs font-extrabold text-foreground transition-all duration-150 hover:border-primary disabled:opacity-40"
        >
          → הקודמת
        </button>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5" aria-label={`שאלה ${Math.min(index + 1, total)} מתוך ${total}`}>
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
          <span className="nums text-[11px] text-muted-foreground">
            {Math.min(index + 1, total)}/{total}
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate(1)}
          disabled={atEnd || flyDir !== 0}
          className="rounded-full border border-border bg-sunken px-3 py-1.5 text-xs font-extrabold text-foreground transition-all duration-150 hover:border-primary disabled:opacity-40"
        >
          הבאה ←
        </button>
      </div>

      <PageFiller label={`פילוח לפי סיעות — ${questions[0].title.slice(0, 24)}…`} />
    </div>
  );
}
