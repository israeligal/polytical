"use client";

// Card body + shared sub-components for the QuestionDeck.
// Includes: QuestionDeckCard, BinaryPills, MultiRows, StanceReveal,
// SwipeOverlay, PendingOverlay, EndCard, LoggedOutCard, DeckChrome, UndoSnackbar.
// Extracted so question-deck.tsx stays under 500 lines.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import type { Politician } from "@/lib/types";
import { catTint } from "@/lib/cat";
import { PoliticianPortrait } from "@/components/politician-portrait";
import type { DeckQuestion, DeckOption } from "@/app/lib/deck/types";

// ─── pill styling mirrors stance-widget + proto-shared Design-1 ──────────────

type OptionTone = "positive" | "negative" | "neutral";

/**
 * Derive tone from option id OR position index.
 * Stance cards use semantic ids ("for"/"against"); binary market cards use
 * arbitrary ids ("yes"/"no", etc.) — those fall back to position-based tone
 * so that option[0] is always positive and option[1] always negative.
 */
function toneFromIdOrIndex(id: string, index: number): OptionTone {
  if (id === "for") return "positive";
  if (id === "against") return "negative";
  // Binary market options: colour by position (first=positive, second=negative).
  // This ensures כן/לא and any other two-option market renders with distinct tones.
  if (index === 0) return "positive";
  if (index === 1) return "negative";
  return "neutral";
}

// Idle: alpha-based so BOTH themes show a clearly visible tint.
// bg-positive-soft / bg-negative-soft are very dark in dark-mode (#0c3f3a / #3a1626),
// which can be imperceptible on the dark card surface.  The /15 alpha of the full
// token gives a clearly distinct tint without relying on the -soft variable.
const pillIdle: Record<OptionTone, string> = {
  positive: "border-positive/35 bg-positive/15 text-positive hover:border-positive hover:shadow-glow-mint",
  negative: "border-negative/35 bg-negative/15 text-negative hover:border-negative hover:shadow-glow-coral",
  neutral: "border-border bg-sunken text-foreground hover:border-primary hover:shadow-glow-mint",
};

const pillActive: Record<OptionTone, string> = {
  positive: "border-positive bg-positive text-positive-foreground shadow-glow-mint",
  negative: "border-negative bg-negative text-negative-foreground shadow-glow-coral",
  neutral: "border-primary bg-primary text-primary-foreground shadow-glow-mint",
};

// ─── sub-components ──────────────────────────────────────────────────────────

interface BinaryPillsProps {
  options: DeckOption[];
  answerId: string | null;
  pending: boolean;
  pendingId: string | null;
  onAnswer: (id: string) => void;
}

export function BinaryPills({ options, answerId, pending, pendingId, onAnswer }: BinaryPillsProps) {
  return (
    <div className="flex gap-2.5" role="group" aria-label="בחירת תשובה">
      {options.map((o, index) => {
        const isActive = o.id === answerId;
        const tone = toneFromIdOrIndex(o.id, index);
        const isThisPending = pending && pendingId === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onAnswer(o.id)}
            disabled={pending}
            aria-pressed={isActive}
            className={[
              "h-[52px] flex-1 cursor-pointer rounded-[14px] border-[1.5px] px-3 text-base font-black transition-all duration-150",
              "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
              isActive ? pillActive[tone] : pillIdle[tone],
            ].join(" ")}
          >
            {isThisPending ? "רושם…" : isActive ? `${o.label} ✓` : o.label}
            {isActive && o.share != null && (
              <span className="nums ms-1.5 text-sm font-bold opacity-75">{o.share}%</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface MultiRowsProps {
  options: DeckOption[];
  answerId: string | null;
  pending: boolean;
  politicians: Politician[];
  onAnswer: (id: string) => void;
}

export function MultiRows({ options, answerId, pending, politicians, onAnswer }: MultiRowsProps) {
  const byPersonId = new Map(politicians.map((p) => [p.id, p]));
  // Popularity order by share desc; ties keep stable order
  const sorted = [...options].sort((a, b) => (b.share ?? 0) - (a.share ?? 0));

  return (
    <ul className="overflow-hidden rounded-[12px] border border-border">
      {sorted.map((o) => {
        const isActive = o.id === answerId;
        const politician = o.personId != null ? byPersonId.get(String(o.personId)) : undefined;
        return (
          <li key={o.id} className="relative overflow-hidden border-b border-border last:border-b-0">
            <div
              aria-hidden
              className={`absolute inset-y-0 start-0 transition-[width] duration-500 ease-out ${catTint[o.color ?? 1]}`}
              style={{ width: `${o.share ?? 0}%` }}
            />
            <button
              type="button"
              onClick={() => onAnswer(o.id)}
              disabled={pending}
              aria-pressed={isActive}
              className="relative flex w-full items-center gap-3 px-3.5 py-2.5 text-start disabled:opacity-60"
            >
              {politician && (
                <span className="shrink-0">
                  <PoliticianPortrait politician={politician} size="sm" />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-foreground">
                {o.label}
              </span>
              <span className="nums shrink-0 font-display text-lg font-black text-foreground">
                {o.share != null ? `${o.share}%` : "—"}
              </span>
              <span
                className={`shrink-0 rounded-[10px] border-[1.5px] px-2.5 py-1 text-xs font-extrabold transition-all duration-150 ${
                  isActive
                    ? "border-primary bg-primary text-primary-foreground shadow-glow-mint"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {isActive ? "✓ שלך" : "בחר"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── stance aggregate line (mirrors stance-widget copy verbatim) ──────────────

interface StanceRevealProps {
  stance: string | null;
  aggregate: { forPct: number; total: number } | null;
  progress: { scoreableCount: number; unlockThreshold: number } | null;
  message: string | null;
}

export function StanceReveal({ stance, aggregate, progress, message }: StanceRevealProps) {
  const remaining = progress ? Math.max(0, progress.unlockThreshold - progress.scoreableCount) : null;
  return (
    <div aria-live="polite">
      {stance != null && (
        <p className="mt-2 text-xs text-muted-foreground">
          לחיצה חוזרת על העמדה שבחרתם מוחקת אותה.
        </p>
      )}
      {message && <p className="mt-2 text-xs font-semibold text-negative">{message}</p>}
      {stance != null && aggregate && (
        <p className="mt-3 text-sm text-foreground">
          <span className="nums font-bold">{aggregate.forPct}%</span> מהקהילה בעד · מתוך{" "}
          <span className="nums">{aggregate.total}</span> עמדות
        </p>
      )}
      {stance != null && !aggregate && progress && (
        <p className="mt-3 text-xs text-muted-foreground">
          עוד אין מספיק עמדות בקהילה להצגת התפלגות.
        </p>
      )}
      {progress &&
        (remaining! > 0 ? (
          <p className="mt-2 text-xs font-semibold text-primary">
            עוד <span className="nums">{remaining}</span> עמדות לפתיחת ״מי מצביע כמוכם״
          </p>
        ) : (
          <Link href="/my-match" className="mt-2 inline-block text-xs font-bold text-primary hover:underline">
            ההתאמה שלכם מוכנה — מי מצביע כמוכם? ←
          </Link>
        ))}
    </div>
  );
}

// ─── swipe drag overlay ───────────────────────────────────────────────────────

interface SwipeOverlayProps {
  dragging: boolean;
  dx: number;
  armed: boolean;
  dragOption: DeckOption | null;
}

export function SwipeOverlay({ dragging, dx, armed, dragOption }: SwipeOverlayProps) {
  if (!dragging || !dragOption) return null;
  return (
    <>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${dx > 0 ? "bg-positive" : "bg-negative"}`}
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
        {armed && <p className="text-sm font-bold text-foreground">שחררו לאישור ✓</p>}
      </div>
    </>
  );
}

// ─── pending state overlay (snap-back during action call) ────────────────────

export function PendingOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-card bg-overlay/60"
    >
      <p className="font-display text-lg font-bold text-foreground">רושם…</p>
    </div>
  );
}

// ─── transition kind ──────────────────────────────────────────────────────────

/**
 * "swipe"  — physical swipe-cast release: big translateX + 14° rotate fly-off.
 * "subtle" — tap-cast, arrow nav, undo return: fade + ~16px directional slide,
 *            ~180ms ease-out, no rotation.
 * The outgoing card receives the kind; the incoming card always fades in.
 */
export type TransitionKind = "swipe" | "subtle";

// ─── main card ────────────────────────────────────────────────────────────────

export interface QuestionDeckCardProps {
  question: DeckQuestion;
  answerId: string | null;
  politicians: Politician[];
  /** Swipe interaction state */
  dragging: boolean;
  dx: number;
  armed: boolean;
  flyDir: -1 | 0 | 1;
  /**
   * Controls the exit animation style.
   * "swipe" = dramatic fly-off (only for physical swipe-cast).
   * "subtle" = fade + 16px directional slide (tap, arrow nav, undo).
   */
  transitionKind: TransitionKind;
  /** Action-pending overlay */
  snapPending: boolean;
  /** Inline error (action failure or rate-limit) */
  inlineMessage: string | null;
  /** Stance response state after server reply */
  stanceState: {
    aggregate: { forPct: number; total: number } | null;
    progress: { scoreableCount: number; unlockThreshold: number } | null;
  } | null;
  onAnswer: (optionId: string) => void;
  /** Pointer event handlers (attached only when swipeable) */
  swipeHandlers: Partial<{
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  }>;
  swipeable: boolean;
  /** Pending state (transition in progress) */
  actionPending: boolean;
  pendingOptionId: string | null;
}

export function QuestionDeckCard({
  question,
  answerId,
  politicians,
  dragging,
  dx,
  armed,
  flyDir,
  transitionKind,
  snapPending,
  inlineMessage,
  stanceState,
  onAnswer,
  swipeHandlers,
  swipeable,
  actionPending,
  pendingOptionId,
}: QuestionDeckCardProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pathname = usePathname();
  // The page's own card links to the page we're already on — keep the slot
  // (identical layout) but render it invisible instead of a dead link.
  const isOwnPage = question.href === pathname;

  const dragOption =
    swipeable && dragging && dx !== 0
      ? dx > 0
        ? question.options[0]
        : question.options[1]
      : null;

  // Exit transform: swipe = dramatic fly (130% + 14°), subtle = 16px directional slide.
  const flyingOut = flyDir !== 0;
  const cardTransform = dragging
    ? `translateX(${dx}px) rotate(${dx * 0.05}deg)`
    : flyingOut
      ? transitionKind === "swipe"
        ? `translateX(${flyDir * 130}%) rotate(${flyDir * 14}deg)`
        : `translateX(${flyDir * 16}px)`
      : "none";

  // Transition duration: swipe exit is 280ms, subtle exit is 180ms.
  const transitionStyle =
    flyingOut && transitionKind === "subtle"
      ? "transition-[transform,opacity] duration-[180ms] ease-out"
      : "transition-[transform,opacity] duration-300 ease-out";

  return (
    <div
      key={question.key}
      tabIndex={-1}
      ref={(el) => {
        // expose so parent can move focus here after fly-off
        if (el) (el as HTMLElement & { _headingRef?: HTMLHeadingElement | null })._headingRef = headingRef.current;
      }}
      {...swipeHandlers}
      style={{ transform: cardTransform, touchAction: swipeable ? "pan-y" : "auto" }}
      className={[
        "relative overflow-hidden rounded-card border bg-card p-4 shadow-2 outline-none",
        armed ? "border-primary" : "border-border",
        swipeable ? "select-none" : "",
        dragging ? "cursor-grabbing" : transitionStyle,
        flyingOut ? "opacity-0" : "",
        snapPending ? "pointer-events-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <SwipeOverlay dragging={dragging} dx={dx} armed={armed} dragOption={dragOption} />
      {snapPending && <PendingOverlay />}

      <p className="mb-1 text-xs font-semibold text-muted-foreground">{question.chip}</p>
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mb-3 font-display text-lg leading-snug text-foreground outline-none"
      >
        {question.title}
      </h3>

      {question.kind !== "multi" ? (
        <>
          <BinaryPills
            options={question.options}
            answerId={answerId}
            pending={actionPending}
            pendingId={pendingOptionId}
            onAnswer={onAnswer}
          />
          {question.kind === "stance" && (
            <StanceReveal
              stance={answerId}
              aggregate={stanceState?.aggregate ?? question.stanceSeed?.aggregate ?? null}
              progress={stanceState?.progress ?? question.stanceSeed?.progress ?? null}
              message={inlineMessage}
            />
          )}
          {question.kind === "binary" && inlineMessage && (
            <p role="status" className="mt-2 text-xs font-semibold text-negative">
              {inlineMessage}
            </p>
          )}
        </>
      ) : (
        <>
          <MultiRows
            options={question.options}
            answerId={answerId}
            pending={actionPending}
            politicians={politicians}
            onAnswer={onAnswer}
          />
          {inlineMessage && (
            <p role="status" className="mt-2 text-xs font-semibold text-negative">
              {inlineMessage}
            </p>
          )}
        </>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
        {isOwnPage ? (
          <span aria-hidden className="invisible text-xs font-bold">
            {question.hrefLabel} ←
          </span>
        ) : (
          <Link
            href={question.href}
            className="text-xs font-bold text-primary hover:underline"
            tabIndex={0}
          >
            {question.hrefLabel} ←
          </Link>
        )}
        {swipeable && (
          <span className="text-[11px] text-muted-foreground">אפשר גם להחליק</span>
        )}
      </div>
    </div>
  );
}

// ─── helpers used by question-deck.tsx ────────────────────────────────────────

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ─── end-of-deck card ─────────────────────────────────────────────────────────

export function EndCard({ feedHref, feedLabel }: { feedHref: string; feedLabel: string }) {
  return (
    <div
      className="relative rounded-card border border-primary bg-card p-6 text-center shadow-2"
      style={{ animation: "deck-rise 0.35s cubic-bezier(.2,.8,.3,1) both" }}
    >
      <p className="font-display text-xl text-foreground">ענית על הכול!</p>
      <Link
        href={feedHref}
        className="mt-3 inline-block text-sm font-bold text-primary hover:underline"
      >
        {feedLabel} ←
      </Link>
    </div>
  );
}

// ─── logged-out single-card read-only view ────────────────────────────────────

export function LoggedOutCard({ question }: { question: DeckQuestion }) {
  const pathname = usePathname();
  const loggedOutIsOwnPage = question.href === pathname;
  const isStance = question.kind === "stance";
  const loginHref = isStance
    ? `/login?callbackUrl=${encodeURIComponent(question.href)}`
    : "/login";
  const loginCta = isStance ? "התחברו כדי לקבוע עמדה" : "התחברו כדי לתת מנדט";

  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-2">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{question.chip}</p>
      <h3 className="mb-4 font-display text-lg leading-snug text-foreground">{question.title}</h3>

      {question.kind !== "multi" ? (
        <div className="flex gap-2.5">
          {question.options.map((o, i) => (
            <div
              key={o.id}
              className={`flex h-[52px] flex-1 cursor-default items-center justify-center rounded-[14px] border-[1.5px] px-3 text-base font-black opacity-60 ${
                i === 0
                  ? "border-positive/35 bg-positive-soft text-positive"
                  : "border-negative/35 bg-negative-soft text-negative"
              }`}
            >
              {o.label}
            </div>
          ))}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-[12px] border border-border opacity-60">
          {question.options.map((o) => (
            <li key={o.id} className="border-b border-border px-3.5 py-2.5 last:border-b-0">
              <span className="text-[15px] font-extrabold text-foreground">{o.label}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 text-center">
        <Link
          href={loginHref}
          className="inline-block rounded-full border-2 border-primary px-5 py-2 text-sm font-bold text-primary transition-all hover:-translate-y-0.5"
        >
          {loginCta}
        </Link>
      </div>
      <div className="mt-3 border-t border-border pt-2.5">
        {loggedOutIsOwnPage ? (
          <span aria-hidden className="invisible text-xs font-bold">
            {question.hrefLabel} ←
          </span>
        ) : (
          <Link href={question.href} className="text-xs font-bold text-primary hover:underline">
            {question.hrefLabel} ←
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── deck chrome (nav arrows + progress dots) ─────────────────────────────────

export interface DeckChromeProps {
  index: number;
  total: number;
  atEnd: boolean;
  flyDir: -1 | 0 | 1;
  snapPending: boolean;
  answeredKeys: Set<string>;
  questionKeys: string[];
  onPrev: () => void;
  onNext: () => void;
}

export function DeckChrome({
  index,
  total,
  atEnd,
  flyDir,
  snapPending,
  answeredKeys,
  questionKeys,
  onPrev,
  onNext,
}: DeckChromeProps) {
  return (
    <div
      className="mt-2.5 flex items-center justify-between px-1"
      style={{ animation: "deck-fade 0.3s ease-out both" }}
    >
      {/* RTL: "previous" = → (end direction) */}
      <button
        type="button"
        onClick={onPrev}
        disabled={index === 0 || flyDir !== 0 || snapPending}
        aria-label="השאלה הקודמת"
        className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary/60 bg-card text-base font-bold text-primary shadow-2 transition-all duration-150 hover:border-primary hover:bg-primary/10 disabled:border-border disabled:text-muted-foreground disabled:opacity-35 disabled:hover:bg-transparent"
      >
        →
      </button>

      <div
        className="flex items-center gap-1.5"
        aria-label={`שאלה ${Math.min(index + 1, total)} מתוך ${total}`}
      >
        {questionKeys.map((key, i) => (
          <span
            key={key}
            aria-hidden
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index
                ? "w-5 bg-primary"
                : answeredKeys.has(key)
                  ? "w-1.5 bg-positive"
                  : "w-1.5 bg-border"
            }`}
          />
        ))}
      </div>

      {/* RTL: "next" = ← (start direction) */}
      <button
        type="button"
        onClick={onNext}
        disabled={atEnd || flyDir !== 0 || snapPending}
        aria-label="השאלה הבאה"
        className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary/60 bg-card text-base font-bold text-primary shadow-2 transition-all duration-150 hover:border-primary hover:bg-primary/10 disabled:border-border disabled:text-muted-foreground disabled:opacity-35 disabled:hover:bg-transparent"
      >
        ←
      </button>
    </div>
  );
}

// ─── undo snackbar ────────────────────────────────────────────────────────────

export interface UndoSnackbarProps {
  label: string;
  kind: "stance" | "market";
  onUndo: () => void;
}

export function UndoSnackbar({ label, kind, onUndo }: UndoSnackbarProps) {
  return (
    <div
      role="status"
      className="mt-3 flex items-center justify-between rounded-card border border-border bg-overlay px-4 py-2.5 shadow-2"
      style={{ animation: "deck-rise 0.35s cubic-bezier(.2,.8,.3,1) both" }}
    >
      <span className="text-sm text-foreground">
        נרשם: <span className="font-extrabold">{label}</span>
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="min-h-9 rounded-full px-3 text-sm font-bold text-primary hover:underline"
      >
        {kind === "stance" ? "ביטול" : "שינוי"}
      </button>
    </div>
  );
}
