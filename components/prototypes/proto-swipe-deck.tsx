"use client";

// ⚠️ THROWAWAY BRAINSTORM PROTOTYPE — variant E v3 (post-review decisions):
//
// HYBRID EMBED — the page's own question renders as a plain widget first;
// answering it morphs the area into the deck (nav row + peek appear, next
// cards arrive in place). The page below always belongs to the FIRST question.
//
// SWIPE = CAST ONLY — only an unanswered two-option card drags. Multi-choice
// and answered cards don't drag at all; back/next buttons + dots are the only
// navigation (kills the gesture-ambiguity blocker and the a11y skip gap).
//
// Review fixes demonstrated here: pointercancel always aborts (never casts),
// edge dead-zones (OS back-swipe), discrete "armed" signal at the threshold
// ("שחררו לאישור"), and an undo snackbar after a swipe-cast.

import { useRef, useState } from "react";
import {
  PageFiller,
  PROTO_QUESTIONS,
  ProtoStyles,
  QuestionBody,
  StreakChip,
  type ProtoQuestion,
} from "./proto-shared";

const CAST_PX = 110; // horizontal travel that arms a cast (review: was 90)
const LOCK_PX = 12; // movement before the gesture axis is decided
const EDGE_PX = 36; // dead zone — drags starting here belong to the OS
const FLY_MS = 280;
const TAP_BEAT_MS = 650;
const UNDO_MS = 5000;

type FlyDir = -1 | 0 | 1;
type Axis = "h" | "v" | null;

interface UndoState {
  questionId: string;
  cardIndex: number;
  label: string;
}

interface SwipeDeckProps {
  questions?: ProtoQuestion[];
}

export function SwipeDeckProto({ questions = PROTO_QUESTIONS }: SwipeDeckProps) {
  const [deckOpen, setDeckOpen] = useState(false); // false = plain page widget
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flyDir, setFlyDir] = useState<FlyDir>(0);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const axis = useRef<Axis>(null);
  const moved = useRef(false);
  const active = useRef(false); // a real pointerdown is in flight — hover never drags
  const undoTimer = useRef<number | null>(null);

  const total = questions.length;
  const atEnd = index >= total;
  const question = atEnd ? null : questions[index];
  const answerId = question ? (answers[question.id] ?? null) : null;
  const answeredCount = Object.keys(answers).length;
  const peek = deckOpen && index + 1 < total ? questions[index + 1] : null;

  // THE rule: swipe exists only where it can mean exactly one thing — cast.
  const swipeable = question != null && question.kind !== "multi" && answerId == null;

  const armed = swipeable && dragging && Math.abs(dx) >= CAST_PX;
  const dragOption =
    swipeable && dx !== 0 ? (dx > 0 ? question.options[0] : question.options[1]) : null;

  function clearUndoLater(nextUndo: UndoState) {
    if (undoTimer.current != null) window.clearTimeout(undoTimer.current);
    setUndo(nextUndo);
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  }

  function flyoutThenGo({ dir, nextIndex }: { dir: FlyDir; nextIndex: number }) {
    setFlyDir(dir);
    window.setTimeout(() => {
      // full gesture reset — stale axis/active state must never leak onto the
      // next card (desktop "autograb": hover pointermove resumed a dead drag)
      axis.current = null;
      active.current = false;
      moved.current = false;
      setDeckOpen(true);
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
    if (!isFirstAnswer) return; // editing a revisited card never advances
    const picked = q.options.find((o) => o.id === optionId);
    const dir: FlyDir = optionId === q.options[0].id ? 1 : -1;
    if (viaSwipe) {
      // the user may not have read what they cast — give them a way back
      clearUndoLater({ questionId: q.id, cardIndex: index, label: picked?.label ?? "" });
      flyoutThenGo({ dir, nextIndex: index + 1 });
    } else {
      window.setTimeout(() => flyoutThenGo({ dir, nextIndex: index + 1 }), TAP_BEAT_MS);
    }
  }

  function undoCast() {
    if (!undo) return;
    if (undoTimer.current != null) window.clearTimeout(undoTimer.current);
    setAnswers((cur) => {
      const next = { ...cur };
      delete next[undo.questionId];
      return next;
    });
    setIndex(undo.cardIndex);
    setUndo(null);
  }

  function navigate(step: 1 | -1) {
    const nextIndex = index + step;
    if (nextIndex < 0 || nextIndex > total) return;
    flyoutThenGo({ dir: step === 1 ? -1 : 1, nextIndex });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (flyDir !== 0) return;
    // edge dead zone: a drag born at the bezel belongs to the OS back gesture
    if (e.clientX < EDGE_PX || e.clientX > window.innerWidth - EDGE_PX) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    moved.current = false;
    active.current = true;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!active.current || flyDir !== 0) return; // hover is not a drag
    if (e.pointerType === "mouse" && e.buttons === 0) {
      // the button was released outside the card — a mouse can't keep dragging
      onPointerAbort();
      return;
    }
    const ddx = e.clientX - start.current.x;
    const ddy = e.clientY - start.current.y;
    if (axis.current == null) {
      if (Math.abs(ddx) < LOCK_PX && Math.abs(ddy) < LOCK_PX) return;
      // horizontal only when clearly horizontal (~34°) — else it's a scroll
      axis.current = Math.abs(ddx) >= 1.5 * Math.abs(ddy) ? "h" : "v";
      if (axis.current === "h") {
        try {
          e.currentTarget.setPointerCapture(e.pointerId); // capture only once it IS a swipe
        } catch {
          /* synthetic pointers in tests can't be captured */
        }
      }
    }
    if (axis.current !== "h") return;
    moved.current = true;
    setDragging(true);
    setDx(ddx);
  }

  /** pointercancel = the OS/browser stole the gesture. ALWAYS abort — never cast. */
  function onPointerAbort() {
    axis.current = null;
    active.current = false;
    setDx(0);
    setDragging(false);
  }

  function onPointerUp() {
    active.current = false;
    if (axis.current !== "h" || flyDir !== 0) {
      setDragging(false);
      return;
    }
    const release = dx;
    axis.current = null;
    if (question && swipeable && Math.abs(release) >= CAST_PX) {
      const option = release > 0 ? question.options[0] : question.options[1];
      setFlyDir(release > 0 ? 1 : -1);
      cast({ q: question, optionId: option.id, viaSwipe: true });
    } else {
      setDx(0); // spring back
      setDragging(false);
    }
  }

  const cardTransform = dragging
    ? `translateX(${dx}px) rotate(${dx * 0.05}deg)`
    : flyDir !== 0
      ? `translateX(${flyDir * 130}%) rotate(${flyDir * 14}deg)`
      : "none";

  const swipeHandlers = swipeable
    ? {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerAbort,
      }
    : {};

  return (
    <div>
      <ProtoStyles />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl text-foreground">וריאנט E v3 — היברידי</h2>
        <StreakChip count={answeredCount} />
      </div>

      <div className="relative">
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
            {...swipeHandlers}
            style={{ transform: cardTransform, touchAction: swipeable ? "pan-y" : "auto" }}
            className={`relative overflow-hidden rounded-card border bg-card p-4 shadow-2 ${
              armed ? "border-primary" : "border-border"
            } ${swipeable ? "select-none" : ""} ${
              dragging ? "cursor-grabbing" : "transition-[transform,opacity] duration-300 ease-out"
            } ${flyDir !== 0 ? "opacity-0" : ""}`}
          >
            {dragOption && dragging && (
              <>
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-0 ${
                    dx > 0 ? "bg-positive" : "bg-negative"
                  }`}
                  style={{ opacity: armed ? 0.5 : Math.min(Math.abs(dx) / 200, 0.35) }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1"
                  style={{ opacity: Math.min(Math.abs(dx) / 90, 1) }}
                >
                  <p
                    className={`font-display text-4xl font-black text-foreground transition-transform duration-100 ${
                      armed ? "scale-110" : ""
                    }`}
                  >
                    {dragOption.label}
                  </p>
                  {/* discrete "armed" signal — the user knows release = cast */}
                  {armed && <p className="text-sm font-bold text-foreground">שחררו לאישור ✓</p>}
                </div>
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
              <span className="text-xs font-bold text-primary">
                {deckOpen ? "לעמוד המלא ←" : ""}
              </span>
              {swipeable && (
                <span className="text-[11px] text-muted-foreground">אפשר גם להחליק</span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* deck chrome appears only after the first answer (the hybrid morph) */}
      {deckOpen && (
        <div className="proto-rise mt-2.5 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={index === 0 || flyDir !== 0}
            aria-label="השאלה הקודמת"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-sm text-foreground shadow-2 transition-all duration-150 hover:border-primary hover:text-primary disabled:opacity-35"
          >
            →
          </button>
          <div className="flex items-center gap-1.5" aria-label={`שאלה ${Math.min(index + 1, total)} מתוך ${total}`}>
            {questions.map((q, i) => (
              <span
                key={q.id}
                aria-hidden
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === index
                    ? "w-5 bg-primary"
                    : answers[q.id] != null
                      ? "w-1.5 bg-positive"
                      : "w-1.5 bg-border"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate(1)}
            disabled={atEnd || flyDir !== 0}
            aria-label="השאלה הבאה"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-sm text-foreground shadow-2 transition-all duration-150 hover:border-primary hover:text-primary disabled:opacity-35"
          >
            ←
          </button>
        </div>
      )}

      {/* undo snackbar — only after a swipe-cast (a tap was explicit) */}
      {undo && (
        <div
          role="status"
          className="proto-rise mt-3 flex items-center justify-between rounded-card border border-border bg-overlay px-4 py-2.5 shadow-2"
        >
          <span className="text-sm text-foreground">
            נרשם: <span className="font-extrabold">{undo.label}</span>
          </span>
          <button
            type="button"
            onClick={undoCast}
            className="min-h-9 rounded-full px-3 text-sm font-bold text-primary hover:underline"
          >
            ביטול
          </button>
        </div>
      )}

      <PageFiller label={`פילוח לפי סיעות — ${questions[0].title.slice(0, 24)}…`} />
    </div>
  );
}
