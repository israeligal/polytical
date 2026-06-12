"use client";

// The production answer deck — swipeable question cards shared by prediction
// markets and Knesset vote stances.  Ports variant E v3 (proto-swipe-deck.tsx)
// faithfully: hybrid morph, swipe=cast only on unanswered binary/stance cards,
// 110px threshold, 34° axis lock, 36px edge dead-zones, armed state, fly-off +
// peek illusion, undo snackbar (5 s), and the confirmed-write rule (snap-back
// while the action is in flight, fly-off only on success).
//
// Spec: docs/decisions/answer-deck.md + CLAUDE.md §React / Next

import { useCallback, useRef, useState, useTransition } from "react";
import type { Politician } from "@/lib/types";
import { setStanceAction } from "@/app/actions/stances";
import { makePredictionAction } from "@/app/actions/bet";
import type { DeckQuestion } from "@/app/lib/deck/types";
import type { StanceActionResult } from "@/app/actions/stances";
import {
  DeckChrome,
  EndCard,
  LoggedOutCard,
  QuestionDeckCard,
  UndoSnackbar,
  prefersReducedMotion,
} from "@/components/question-deck-card";
import type { TransitionKind } from "@/components/question-deck-card";

// ─── constants (mirror the prototype) ────────────────────────────────────────

const CAST_PX = 110;
const LOCK_PX = 12;
const EDGE_PX = 36;
const FLY_MS = 280;
const SUBTLE_MS = 180; // tap / arrow nav / undo exit duration
const TAP_BEAT_MS = 800;
const UNDO_MS = 5000;

// ─── types ────────────────────────────────────────────────────────────────────

type FlyDir = -1 | 0 | 1;
type Axis = "h" | "v" | null;

interface CardState {
  answerId: string | null;
  message: string | null;
  stanceState: {
    aggregate: { forPct: number; total: number } | null;
    progress: { scoreableCount: number; unlockThreshold: number } | null;
  } | null;
}

interface UndoState {
  questionKey: string;
  cardIndex: number;
  label: string;
  kind: "stance" | "market";
}

// ─── injectable action types (for Storybook / tests) ─────────────────────────

type SetStanceFn = (args: { voteId: number; stance: "for" | "against" }) => Promise<StanceActionResult>;
type MakePredictionFn = (args: { marketId: string; outcomeId: string }) => Promise<{ ok: boolean; message?: string }>;

// ─── props ────────────────────────────────────────────────────────────────────

export interface QuestionDeckProps {
  questions: DeckQuestion[];
  politicians: Politician[];
  loggedIn: boolean;
  feedHref: string;
  feedLabel: string;
  /** Injectable for Storybook / tests. Defaults to the real server action. */
  _setStanceAction?: SetStanceFn;
  /** Injectable for Storybook / tests. Defaults to the real server action. */
  _makePredictionAction?: MakePredictionFn;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

// ─── main component ────────────────────────────────────────────────────────────

export function QuestionDeck({
  questions,
  politicians,
  loggedIn,
  feedHref,
  feedLabel,
  _setStanceAction = setStanceAction,
  _makePredictionAction = makePredictionAction,
}: QuestionDeckProps) {
  const total = questions.length;

  const [cardStates, setCardStates] = useState<Record<string, CardState>>(() => {
    const init: Record<string, CardState> = {};
    for (const q of questions) {
      init[q.key] = {
        answerId: q.initialAnswerId,
        message: null,
        stanceState: q.stanceSeed
          ? { aggregate: q.stanceSeed.aggregate, progress: q.stanceSeed.progress }
          : null,
      };
    }
    return init;
  });

  // The deck ALWAYS lands on the page's own question (card 0) — on a revisit it
  // shows the user's pick. Chrome starts open on a revisit so the queue is one
  // tap away; on a fresh card it appears after the first answer (hybrid morph).
  const [index, setIndex] = useState(0);
  const [deckOpen, setDeckOpen] = useState(() => questions[0]?.initialAnswerId != null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flyDir, setFlyDir] = useState<FlyDir>(0);
  const [transitionKind, setTransitionKind] = useState<TransitionKind>("subtle");
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [snapPending, setSnapPending] = useState(false);
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const start = useRef({ x: 0, y: 0 });
  const axis = useRef<Axis>(null);
  const moved = useRef(false);
  const active = useRef(false);
  const undoTimer = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const [, startTransition] = useTransition();

  const atEnd = index >= total;
  const question = atEnd ? null : (questions[index] ?? null);
  const answerId = question ? (cardStates[question.key]?.answerId ?? null) : null;
  const peek = deckOpen && !atEnd && index + 1 < total ? questions[index + 1] : null;
  const swipeable = question != null && question.kind !== "multi" && answerId == null && !snapPending;
  const armed = swipeable && dragging && Math.abs(dx) >= CAST_PX;

  // ── state helper ─────────────────────────────────────────────────────────────

  function setCardState(key: string, patch: Partial<CardState>) {
    setCardStates((prev) => ({ ...prev, [key]: { ...prev[key]!, ...patch } }));
  }

  // ── undo timer ────────────────────────────────────────────────────────────────

  function scheduleUndoClear(next: UndoState) {
    if (undoTimer.current != null) window.clearTimeout(undoTimer.current);
    setUndo(next);
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  }

  function clearUndo() {
    if (undoTimer.current != null) window.clearTimeout(undoTimer.current);
    setUndo(null);
  }

  // ── fly-off then advance ──────────────────────────────────────────────────────

  const flyoutThenGo = useCallback(
    ({
      dir,
      nextIndex,
      fromKey,
      kind,
    }: {
      dir: FlyDir;
      nextIndex: number;
      fromKey: string;
      kind: TransitionKind;
    }) => {
      const announceAdvance = () => {
        const nextQ = questions[nextIndex];
        if (!nextQ) return;
        const ans = cardStates[fromKey]?.answerId;
        const label = questions.find((q) => q.key === fromKey)?.options.find((o) => o.id === ans)?.label ?? "";
        setAnnouncement(`${label} נרשם. השאלה הבאה: ${nextQ.title}`);
      };
      const advance = () => {
        axis.current = null;
        active.current = false;
        moved.current = false;
        setDeckOpen(true);
        setIndex(nextIndex);
        setFlyDir(0);
        setDx(0);
        setDragging(false);
        announceAdvance();
        window.requestAnimationFrame(() => {
          (cardRef.current?.querySelector("h3") as HTMLElement | null)?.focus();
        });
      };
      if (prefersReducedMotion()) {
        advance();
        return;
      }
      // When navigating back from the end card there is no outgoing QuestionDeckCard
      // to animate — the EndCard doesn't participate in the fly-off.  Skip the
      // fly-out delay and swap immediately so the card just fades in cleanly.
      const fromEndCard = atEnd && dir !== 0;
      if (fromEndCard) {
        advance();
        return;
      }
      setTransitionKind(kind);
      setFlyDir(dir);
      window.setTimeout(advance, kind === "swipe" ? FLY_MS : SUBTLE_MS);
    },
    [cardStates, questions, atEnd],
  );

  // ── cast via tap ──────────────────────────────────────────────────────────────

  const castTap = useCallback(
    (q: DeckQuestion, optionId: string) => {
      if (moved.current) return;
      const prev = cardStates[q.key]?.answerId ?? null;
      const isFirstAnswer = prev == null;
      const isSameStance = q.kind === "stance" && prev === optionId;

      setPendingOptionId(optionId);
      startTransition(async () => {
        let ok = false;
        let errored = false;

        if (q.kind === "stance" && q.voteId != null) {
          setCardState(q.key, { answerId: isSameStance ? null : optionId, message: null });
          try {
            const res = await _setStanceAction({ voteId: q.voteId, stance: optionId as "for" | "against" });
            if (res.ok) {
              ok = true;
              setCardState(q.key, {
                answerId: res.stance ?? null,
                message: null,
                stanceState: { aggregate: res.aggregate, progress: { scoreableCount: res.scoreableCount, unlockThreshold: res.unlockThreshold } },
              });
            } else {
              setCardState(q.key, { answerId: prev, message: res.message ?? "אירעה שגיאה — נסו שוב" });
              errored = true;
            }
          } catch {
            setCardState(q.key, { answerId: prev, message: "אירעה שגיאה — נסו שוב" });
            errored = true;
          }
        } else if (q.kind !== "stance" && q.marketId != null) {
          setCardState(q.key, { answerId: optionId, message: null });
          try {
            const res = await _makePredictionAction({ marketId: q.marketId, outcomeId: optionId });
            if (res.ok) {
              ok = true;
            } else {
              setCardState(q.key, { answerId: prev, message: res.message ?? "אירעה שגיאה — נסו שוב" });
              errored = true;
            }
          } catch {
            setCardState(q.key, { answerId: prev, message: "אירעה שגיאה — נסו שוב" });
            errored = true;
          }
        }

        setPendingOptionId(null);
        if (ok && isFirstAnswer && !isSameStance && !errored) {
          window.setTimeout(() => {
            flyoutThenGo({
              dir: optionId === q.options[0].id ? 1 : -1,
              nextIndex: index + 1,
              fromKey: q.key,
              kind: "subtle",
            });
          }, TAP_BEAT_MS);
        }
      });
    },
    [cardStates, index, _setStanceAction, _makePredictionAction, flyoutThenGo],
  );

  // ── cast via swipe ────────────────────────────────────────────────────────────

  const castSwipe = useCallback(
    (q: DeckQuestion, optionId: string) => {
      const prev = cardStates[q.key]?.answerId ?? null;
      const dir: FlyDir = optionId === q.options[0].id ? 1 : -1;
      const pickedLabel = q.options.find((o) => o.id === optionId)?.label ?? "";

      setSnapPending(true);
      setDragging(false);
      setDx(0);

      startTransition(async () => {
        let ok = false;

        if (q.kind === "stance" && q.voteId != null) {
          try {
            const res = await _setStanceAction({ voteId: q.voteId, stance: optionId as "for" | "against" });
            if (res.ok) {
              ok = true;
              setCardState(q.key, {
                answerId: res.stance ?? null,
                message: null,
                stanceState: { aggregate: res.aggregate, progress: { scoreableCount: res.scoreableCount, unlockThreshold: res.unlockThreshold } },
              });
            } else {
              setCardState(q.key, { message: res.message ?? "אירעה שגיאה — נסו שוב" });
            }
          } catch {
            setCardState(q.key, { message: "אירעה שגיאה — נסו שוב" });
          }
        } else if (q.kind !== "stance" && q.marketId != null) {
          try {
            const res = await _makePredictionAction({ marketId: q.marketId, outcomeId: optionId });
            if (res.ok) {
              ok = true;
              setCardState(q.key, { answerId: optionId, message: null });
            } else {
              setCardState(q.key, { answerId: prev, message: res.message ?? "אירעה שגיאה — נסו שוב" });
            }
          } catch {
            setCardState(q.key, { answerId: prev, message: "אירעה שגיאה — נסו שוב" });
          }
        }

        setSnapPending(false);
        if (ok) {
          scheduleUndoClear({ questionKey: q.key, cardIndex: index, label: pickedLabel, kind: q.kind === "stance" ? "stance" : "market" });
          flyoutThenGo({ dir, nextIndex: index + 1, fromKey: q.key, kind: "swipe" });
        }
      });
    },
    [cardStates, index, _setStanceAction, _makePredictionAction, flyoutThenGo],
  );

  // ── undo handler ──────────────────────────────────────────────────────────────

  async function handleUndo() {
    if (!undo) return;
    const { questionKey, cardIndex, kind } = undo;
    clearUndo();
    const q = questions.find((qq) => qq.key === questionKey);
    if (kind === "stance" && q?.voteId != null) {
      const curAnswer = cardStates[questionKey]?.answerId;
      if (curAnswer) {
        startTransition(async () => {
          try {
            const res = await _setStanceAction({ voteId: q.voteId!, stance: curAnswer as "for" | "against" });
            if (res.ok) {
              setCardState(questionKey, {
                answerId: res.stance ?? null,
                message: null,
                stanceState: { aggregate: res.aggregate, progress: { scoreableCount: res.scoreableCount, unlockThreshold: res.unlockThreshold } },
              });
            }
          } catch { /* keep current state */ }
        });
      }
    }
    // For market picks: navigate back (picks are editable until close)
    setIndex(cardIndex);
  }

  // ── navigation ────────────────────────────────────────────────────────────────

  function navigate(step: 1 | -1) {
    if (flyDir !== 0 || snapPending) return;
    const nextIndex = index + step;
    if (nextIndex < 0 || nextIndex > total) return;
    flyoutThenGo({
      dir: step === 1 ? -1 : 1,
      nextIndex,
      fromKey: question?.key ?? "",
      kind: "subtle",
    });
  }

  // ── pointer handlers ──────────────────────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (flyDir !== 0 || snapPending) return;
    if (e.clientX < EDGE_PX || e.clientX > window.innerWidth - EDGE_PX) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    moved.current = false;
    active.current = true;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!active.current || flyDir !== 0) return;
    if (e.pointerType === "mouse" && e.buttons === 0) { onPointerAbort(); return; }
    const ddx = e.clientX - start.current.x;
    const ddy = e.clientY - start.current.y;
    if (axis.current == null) {
      if (Math.abs(ddx) < LOCK_PX && Math.abs(ddy) < LOCK_PX) return;
      axis.current = Math.abs(ddx) >= 1.5 * Math.abs(ddy) ? "h" : "v";
      if (axis.current === "h") {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      }
    }
    if (axis.current !== "h") return;
    moved.current = true;
    setDragging(true);
    setDx(ddx);
  }

  function onPointerAbort() {
    axis.current = null;
    active.current = false;
    setDx(0);
    setDragging(false);
  }

  function onPointerUp() {
    active.current = false;
    if (axis.current !== "h" || flyDir !== 0) { setDragging(false); return; }
    const release = dx;
    axis.current = null;
    if (question && swipeable && Math.abs(release) >= CAST_PX) {
      castSwipe(question, release > 0 ? question.options[0].id : question.options[1].id);
    } else {
      setDx(0);
      setDragging(false);
    }
  }

  const swipeHandlers = swipeable
    ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerAbort }
    : {};

  // ── render ────────────────────────────────────────────────────────────────────

  if (!loggedIn) {
    const first = questions[0];
    if (!first) return null;
    return <LoggedOutCard question={first} />;
  }

  const answeredKeys = new Set(
    Object.entries(cardStates)
      .filter(([, s]) => s.answerId != null)
      .map(([k]) => k),
  );

  return (
    <>
      {/* keyframes — globals.css has no deck-specific ones */}
      <style>{`
        @keyframes deck-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes deck-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* A11Y visually-hidden live region */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <div className="relative">
        {/* Peek: next card behind current */}
        {peek && flyDir === 0 && !snapPending && (
          <div
            aria-hidden
            className="absolute inset-0 translate-y-2.5 scale-x-[.96] overflow-hidden rounded-card border border-border bg-card p-4 opacity-60"
          >
            <p className="text-xs font-semibold text-muted-foreground">{peek.chip}</p>
            <p className="truncate font-display text-lg text-foreground">{peek.title}</p>
          </div>
        )}

        {atEnd ? (
          <EndCard feedHref={feedHref} feedLabel={feedLabel} />
        ) : question ? (
          <div ref={cardRef}>
            <QuestionDeckCard
              question={question}
              answerId={answerId}
              politicians={politicians}
              dragging={dragging}
              dx={dx}
              armed={armed}
              flyDir={flyDir}
              transitionKind={transitionKind}
              snapPending={snapPending}
              inlineMessage={cardStates[question.key]?.message ?? null}
              stanceState={cardStates[question.key]?.stanceState ?? null}
              onAnswer={(optionId) => castTap(question, optionId)}
              swipeHandlers={swipeHandlers}
              swipeable={swipeable}
              actionPending={snapPending || pendingOptionId != null}
              pendingOptionId={pendingOptionId}
            />
          </div>
        ) : null}
      </div>

      {deckOpen && (
        <DeckChrome
          index={index}
          total={total}
          atEnd={atEnd}
          flyDir={flyDir}
          snapPending={snapPending}
          answeredKeys={answeredKeys}
          questionKeys={questions.map((q) => q.key)}
          onPrev={() => navigate(-1)}
          onNext={() => navigate(1)}
        />
      )}

      {undo && (
        <UndoSnackbar label={undo.label} kind={undo.kind} onUndo={handleUndo} />
      )}
    </>
  );
}
