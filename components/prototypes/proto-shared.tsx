"use client";

// ⚠️ THROWAWAY BRAINSTORM PROTOTYPE — post-answer "next question" flow.
// Self-contained mock layer shared by the four NextFlow variants. Nothing in
// the app imports from components/prototypes/; delete after the design call.
//
// It also demos the UNIFIED one-tap grammar (the "hybrid" decision): binary
// markets, multi markets and vote stances all answer with a single tap on the
// option itself — no separate submit button, whole row tappable on multi.

import type { CatColor } from "@/lib/types";
import { catTint } from "@/lib/cat";

export type ProtoKind = "binary" | "multi" | "stance";
export type ProtoTone = "positive" | "negative" | "neutral";

export interface ProtoOption {
  id: string;
  label: string;
  /** Crowd share % — known upfront for markets; null for stances (k-gated). */
  share: number | null;
  tone: ProtoTone;
  color?: CatColor;
}

export interface ProtoQuestion {
  id: string;
  kind: ProtoKind;
  /** Feed chip, e.g. תחזית · מינויים / הצבעה בכנסת */
  chip: string;
  title: string;
  options: ProtoOption[];
  /** Aggregate line revealed only after answering a stance (k≥10). */
  revealLine?: string;
}

/** Mixed queue on purpose: proves one grammar covers both features. In prod
 *  the pool stays per-feature (markets→markets, votes→votes). */
export const PROTO_QUESTIONS: ProtoQuestion[] = [
  {
    id: "q1",
    kind: "binary",
    chip: "תחזית · מינויים",
    title: "האם ישראל כץ יהיה שר האוצר בממשלה הבאה?",
    options: [
      { id: "yes", label: "כן", share: 33, tone: "positive" },
      { id: "no", label: "לא", share: 67, tone: "negative" },
    ],
  },
  {
    id: "q2",
    kind: "stance",
    chip: "הצבעה בכנסת",
    title: "הצעת חוק שירות ביטחון (תיקון — גיוס תלמידי ישיבות), קריאה ראשונה",
    options: [
      { id: "for", label: "בעד", share: null, tone: "positive" },
      { id: "against", label: "נגד", share: null, tone: "negative" },
    ],
    revealLine: "62% מהקהילה בעד · מתוך 134 עמדות",
  },
  {
    id: "q3",
    kind: "multi",
    chip: "תחזית · בחירות",
    title: "מי ירכיב את הממשלה הבאה?",
    options: [
      { id: "eisenkot", label: "גדי איזנקוט", share: 50, tone: "neutral", color: 2 },
      { id: "bibi", label: "בנימין נתניהו", share: 25, tone: "neutral", color: 5 },
      { id: "bennett", label: "נפתלי בנט", share: 25, tone: "neutral", color: 7 },
      { id: "other", label: "אחר", share: 0, tone: "neutral", color: 4 },
    ],
  },
  {
    id: "q4",
    kind: "binary",
    chip: "תחזית · בחירות",
    title: "האם יוכרזו בחירות מוקדמות עד סוף 2026?",
    options: [
      { id: "yes", label: "כן", share: 30, tone: "positive" },
      { id: "no", label: "לא", share: 70, tone: "negative" },
    ],
  },
  {
    id: "q5",
    kind: "stance",
    chip: "הצבעה בכנסת",
    title: "חוק יסוד: ישראל — מדינת הלאום של העם היהודי (תיקון מס׳ 2)",
    options: [
      { id: "for", label: "בעד", share: null, tone: "positive" },
      { id: "against", label: "נגד", share: null, tone: "negative" },
    ],
    revealLine: "44% מהקהילה בעד · מתוך 89 עמדות",
  },
];

// Design 1 ("מלבנים גדולים") — the chosen binary surface: two equal 52px
// targets, flatter radius, % inline. One tap = answer.
const pillIdle: Record<ProtoTone, string> = {
  positive: "border-positive/35 bg-positive-soft text-positive hover:border-positive",
  negative: "border-negative/35 bg-negative-soft text-negative hover:border-negative",
  neutral: "border-border bg-sunken text-foreground hover:border-primary",
};

const pillActive: Record<ProtoTone, string> = {
  positive: "border-positive bg-positive text-positive-foreground shadow-glow-mint",
  negative: "border-negative bg-negative text-negative-foreground",
  neutral: "border-primary bg-primary text-primary-foreground shadow-glow-mint",
};

export interface QuestionBodyProps {
  question: ProtoQuestion;
  answerId: string | null;
  onAnswer: (optionId: string) => void;
}

/** The unified one-tap answer surface (pills for 2 options, rows for 3+). */
export function QuestionBody({ question, answerId, onAnswer }: QuestionBodyProps) {
  if (question.kind !== "multi") {
    return (
      <div>
        <div className="flex gap-2.5" role="group" aria-label="בחירת תשובה">
          {question.options.map((o) => {
            const active = o.id === answerId;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onAnswer(o.id)}
                aria-pressed={active}
                className={`h-[52px] flex-1 rounded-[14px] border-[1.5px] px-3 text-base font-black transition-all duration-150 active:scale-[0.98] ${
                  active ? pillActive[o.tone] : pillIdle[o.tone]
                }`}
              >
                {o.label}
                {active && " ✓"}
                {o.share != null && <span className="nums ms-1.5 text-sm font-bold opacity-75">{o.share}%</span>}
              </button>
            );
          })}
        </div>
        {answerId != null && (
          <p role="status" className="proto-rise mt-2.5 text-center text-xs font-semibold text-positive">
            {question.kind === "stance" ? "העמדה נרשמה ✓" : "המנדט נרשם ✓"}
            {question.revealLine && (
              <span className="mt-0.5 block font-normal text-muted-foreground">{question.revealLine}</span>
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <ul className="overflow-hidden rounded-[12px] border border-border">
      {question.options.map((o) => {
        const active = o.id === answerId;
        return (
          <li key={o.id} className="relative overflow-hidden border-b border-border last:border-b-0">
            <div
              aria-hidden
              className={`absolute inset-y-0 start-0 transition-[width] duration-500 ease-out ${catTint[o.color ?? 1]}`}
              style={{ width: `${o.share ?? 0}%` }}
            />
            {/* whole row tappable — one target, same grammar as the pills */}
            <button
              type="button"
              onClick={() => onAnswer(o.id)}
              aria-pressed={active}
              className="relative flex w-full items-center gap-3 px-3.5 py-2.5 text-start"
            >
              <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-foreground">{o.label}</span>
              <span className="nums shrink-0 font-display text-lg font-black text-foreground">{o.share}%</span>
              <span
                className={`shrink-0 rounded-[10px] border-[1.5px] px-2.5 py-1 text-xs font-extrabold transition-all duration-150 ${
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-glow-mint"
                    : "border-border bg-card text-muted-foreground"
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

export interface QuestionCardProps {
  question: ProtoQuestion;
  answerId: string | null;
  onAnswer: (optionId: string) => void;
  /** e.g. "השאלה הבאה" — rendered as a small eyebrow above the chip. */
  eyebrow?: string;
  flat?: boolean;
}

export function QuestionCard({ question, answerId, onAnswer, eyebrow, flat = false }: QuestionCardProps) {
  return (
    <div className={flat ? "" : "rounded-card border border-border bg-card p-4 shadow-2"}>
      {eyebrow && <p className="mb-1 text-xs font-bold text-primary">{eyebrow}</p>}
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{question.chip}</p>
      <h3 className="mb-3 font-display text-lg leading-snug text-foreground">{question.title}</h3>
      <QuestionBody question={question} answerId={answerId} onAnswer={onAnswer} />
    </div>
  );
}

export interface AnsweredStripProps {
  question: ProtoQuestion;
  answerId: string;
}

/** Compact record of an already-answered question (variant A stack history). */
export function AnsweredStrip({ question, answerId }: AnsweredStripProps) {
  const picked = question.options.find((o) => o.id === answerId);
  return (
    <div className="flex items-center gap-2.5 rounded-[12px] border border-border bg-sunken px-3.5 py-2.5">
      <span aria-hidden className="text-positive">✓</span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{question.title}</span>
      <span className="shrink-0 text-sm font-extrabold text-foreground">{picked?.label}</span>
    </div>
  );
}

export function StreakChip({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <span className="proto-rise inline-flex items-center gap-1 rounded-full border border-accent bg-card px-2.5 py-0.5 text-xs font-extrabold text-accent">
      🔥 <span className="nums">{count}</span> ברצף
    </span>
  );
}

/** Fake below-the-fold page content (breakdown / comments) so each variant
 *  shows what gets pushed down, covered, or left behind. */
export function PageFiller({ label }: { label?: string }) {
  return (
    <div aria-hidden className="mt-5 space-y-4 opacity-80">
      <div className="rounded-card border border-border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">{label ?? "פילוח לפי סיעות"}</p>
        <div className="space-y-2">
          <div className="h-3 w-full rounded-full bg-sunken" />
          <div className="h-3 w-4/5 rounded-full bg-sunken" />
          <div className="h-3 w-3/5 rounded-full bg-sunken" />
        </div>
      </div>
      <div className="rounded-card border border-border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">תגובות</p>
        <div className="space-y-2">
          <div className="h-3 w-5/6 rounded-full bg-sunken" />
          <div className="h-3 w-2/3 rounded-full bg-sunken" />
        </div>
      </div>
    </div>
  );
}

/** Keyframes for the prototypes only (prod would use tokens/Motion). */
export function ProtoStyles() {
  return (
    <style>{`
      @keyframes proto-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      @keyframes proto-sheet { from { transform: translateY(100%); } to { transform: none; } }
      @keyframes proto-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes proto-from-s-rtl { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: none; } }
      @keyframes proto-from-s-ltr { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
      .proto-rise { animation: proto-rise .35s cubic-bezier(.2,.8,.3,1) both; }
      .proto-sheet { animation: proto-sheet .35s cubic-bezier(.2,.8,.3,1) both; }
      .proto-fade { animation: proto-fade .3s ease-out both; }
      [dir="rtl"] .proto-slide { animation: proto-from-s-rtl .3s ease-out both; }
      [dir="ltr"] .proto-slide { animation: proto-from-s-ltr .3s ease-out both; }
    `}</style>
  );
}
