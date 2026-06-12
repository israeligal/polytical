"use client";

// ⚠️ THROWAWAY BRAINSTORM PROTOTYPE — binary answer-button redesigns.
// The current BetPanel pills (rounded, text-sm, px-3 py-1.5) read small next to
// Polymarket's big Yes/No targets. Three candidate directions, all ONE-TAP
// (the hybrid decision: tap = answer, no separate "תנו מנדט" submit):
//   1. split — two big side-by-side buttons (Polymarket energy, our tokens)
//   2. bar   — the odds bar itself becomes the control (tap a side to answer)
//   3. rows  — binary rendered with the SAME row grammar as multi markets

import { useState } from "react";
import { ProtoStyles } from "./proto-shared";

type BinaryAnswer = "yes" | "no" | null;

const SHARE_YES = 33;
const SHARE_NO = 67;
/** Keep both bar segments tappable even on lopsided markets. */
const BAR_MIN_PCT = 25;

interface DesignSectionProps {
  answer: BinaryAnswer;
  onAnswer: (next: Exclude<BinaryAnswer, null>) => void;
}

/* 1 — big split buttons --------------------------------------------- */

export function SplitButtons({ answer, onAnswer }: DesignSectionProps) {
  const base =
    "h-[52px] rounded-[14px] border-[1.5px] text-base font-black transition-all duration-150 active:scale-[0.98]";
  return (
    <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="בחירת תוצאה">
      <button
        type="button"
        aria-pressed={answer === "yes"}
        onClick={() => onAnswer("yes")}
        className={`${base} ${
          answer === "yes"
            ? "border-positive bg-positive text-positive-foreground shadow-glow-mint"
            : "border-positive/35 bg-positive-soft text-positive hover:border-positive"
        }`}
      >
        כן{answer === "yes" && " ✓"} <span className="nums ms-1 text-sm font-bold opacity-75">{SHARE_YES}%</span>
      </button>
      <button
        type="button"
        aria-pressed={answer === "no"}
        onClick={() => onAnswer("no")}
        className={`${base} ${
          answer === "no"
            ? "border-negative bg-negative text-negative-foreground"
            : "border-negative/35 bg-negative-soft text-negative hover:border-negative"
        }`}
      >
        לא{answer === "no" && " ✓"} <span className="nums ms-1 text-sm font-bold opacity-75">{SHARE_NO}%</span>
      </button>
    </div>
  );
}

/* 2 — tappable split bar (the odds bar IS the control) --------------- */

export function BarButtons({ answer, onAnswer }: DesignSectionProps) {
  const yesWidth = Math.min(Math.max(SHARE_YES, BAR_MIN_PCT), 100 - BAR_MIN_PCT);
  const segment =
    "flex items-center justify-center gap-1.5 text-base font-black transition-all duration-300 active:scale-[0.99]";
  return (
    <div className="flex h-[52px] w-full overflow-hidden rounded-[14px] border border-border" role="group" aria-label="בחירת תוצאה">
      <button
        type="button"
        aria-pressed={answer === "yes"}
        onClick={() => onAnswer("yes")}
        style={{ width: `${yesWidth}%` }}
        className={`${segment} ${
          answer === "yes"
            ? "bg-positive text-positive-foreground"
            : `bg-positive-soft text-positive ${answer === "no" ? "opacity-55" : ""}`
        }`}
      >
        כן{answer === "yes" && " ✓"} <span className="nums text-sm font-bold opacity-80">{SHARE_YES}%</span>
      </button>
      <button
        type="button"
        aria-pressed={answer === "no"}
        onClick={() => onAnswer("no")}
        style={{ width: `${100 - yesWidth}%` }}
        className={`${segment} border-s border-border ${
          answer === "no"
            ? "bg-negative text-negative-foreground"
            : `bg-negative-soft text-negative ${answer === "yes" ? "opacity-55" : ""}`
        }`}
      >
        לא{answer === "no" && " ✓"} <span className="nums text-sm font-bold opacity-80">{SHARE_NO}%</span>
      </button>
    </div>
  );
}

/* 3 — binary as rows (same grammar as the multi market) -------------- */

export function RowButtons({ answer, onAnswer }: DesignSectionProps) {
  const rows = [
    { id: "yes" as const, label: "כן", share: SHARE_YES, fill: "bg-positive-soft", chip: "border-positive bg-positive text-positive-foreground" },
    { id: "no" as const, label: "לא", share: SHARE_NO, fill: "bg-negative-soft", chip: "border-negative bg-negative text-negative-foreground" },
  ];
  return (
    <ul className="overflow-hidden rounded-[14px] border border-border" aria-label="בחירת תוצאה">
      {rows.map((row) => {
        const active = answer === row.id;
        return (
          <li key={row.id} className="relative overflow-hidden border-b border-border last:border-b-0">
            <div
              aria-hidden
              className={`absolute inset-y-0 start-0 transition-[width] duration-500 ease-out ${row.fill}`}
              style={{ width: `${row.share}%` }}
            />
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onAnswer(row.id)}
              className="relative flex w-full items-center gap-3 px-4 py-3 text-start"
            >
              <span className="min-w-0 flex-1 text-base font-black text-foreground">{row.label}</span>
              <span className="nums shrink-0 font-display text-xl font-black text-foreground">{row.share}%</span>
              <span
                className={`shrink-0 rounded-[10px] border-[1.5px] px-3 py-1.5 text-xs font-extrabold transition-all duration-150 ${
                  active ? row.chip : "border-border bg-card text-muted-foreground"
                }`}
              >
                {active ? "✓ שלך" : "בחר"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* current prod pills, for honest side-by-side ------------------------ */

export function CurrentPills({ answer, onAnswer }: DesignSectionProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        aria-pressed={answer === "yes"}
        onClick={() => onAnswer("yes")}
        className={`rounded-[12px] border-[1.5px] px-3 py-1.5 text-sm font-extrabold transition-colors ${
          answer === "yes"
            ? "border-positive bg-positive text-primary-foreground"
            : "border-positive bg-positive-soft text-positive"
        }`}
      >
        כן <span className="nums opacity-70">{SHARE_YES}%</span>
      </button>
      <button
        type="button"
        aria-pressed={answer === "no"}
        onClick={() => onAnswer("no")}
        className={`rounded-[12px] border-[1.5px] px-3 py-1.5 text-sm font-extrabold transition-colors ${
          answer === "no"
            ? "border-negative bg-negative text-primary-foreground"
            : "border-negative bg-negative-soft text-negative"
        }`}
      >
        לא <span className="nums opacity-70">{SHARE_NO}%</span>
      </button>
    </div>
  );
}

/* demo wrapper -------------------------------------------------------- */

const DESIGNS = [
  { key: "current", title: "היום (לייחוס)", note: "פיל קטן + כפתור ״תנו מנדט״ נפרד", Control: CurrentPills },
  { key: "split", title: "1 · מלבנים גדולים", note: "שני יעדים שווים, שורה אחת, 52px", Control: SplitButtons },
  { key: "bar", title: "2 · בר־המנדטים כלחצן", note: "הרוחב = פיצול הקהל; לוחצים על צד", Control: BarButtons },
  { key: "rows", title: "3 · שורות (כמו רב־ברירה)", note: "דקדוק אחד לכל סוגי השאלות", Control: RowButtons },
] as const;

export function BinaryButtonsCompare() {
  const [answers, setAnswers] = useState<Record<string, BinaryAnswer>>({});
  return (
    <div className="space-y-4">
      <ProtoStyles />
      <div className="rounded-card border border-border bg-card p-4 shadow-2">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">תחזית · מינויים</p>
        <h3 className="font-display text-lg leading-snug text-foreground">
          האם ישראל כץ יהיה שר האוצר בממשלה הבאה?
        </h3>
      </div>
      {DESIGNS.map(({ key, title, note, Control }) => (
        <section key={key} className="rounded-card border border-border bg-card p-4 shadow-2">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h4 className="text-sm font-extrabold text-foreground">{title}</h4>
            <p className="text-xs text-muted-foreground">{note}</p>
          </div>
          <Control
            answer={answers[key] ?? null}
            onAnswer={(next) => setAnswers((cur) => ({ ...cur, [key]: cur[key] === next ? null : next }))}
          />
          {answers[key] != null && (
            <p role="status" className="proto-rise mt-2.5 text-center text-xs font-semibold text-positive">
              המנדט נרשם ✓ <span className="font-normal text-muted-foreground">· לחיצה על האפשרות השנייה משנה</span>
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
