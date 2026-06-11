"use client";

// עמדה widget — the outcome-pill toggle (design-spec §4: selectable YES/NO
// pills; selected → filled bg-positive/bg-negative with -foreground text).
// Optimistic with functional-update rollback (the comment-row precedent), so
// rapid double-taps can't desync. Tapping the selected pill RETRACTS (privacy:
// a recorded position must be removable). Aggregate + match progress render
// from the server response only — never optimistically.

import Link from "next/link";
import { useState, useTransition } from "react";
import { setStanceAction } from "@/app/actions/stances";

type Stance = "for" | "against";

export function StanceWidget({
  voteId,
  initialStance,
  loggedIn,
}: {
  voteId: number;
  initialStance: Stance | null;
  loggedIn: boolean;
}) {
  const [stance, setStance] = useState<Stance | null>(initialStance);
  const [aggregate, setAggregate] = useState<{ forPct: number; total: number } | null>(null);
  const [progress, setProgress] = useState<{ scoreableCount: number; unlockThreshold: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!loggedIn) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-sm font-semibold text-foreground">מה העמדה שלכם?</p>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/vote/${voteId}`)}`}
          className="mt-2 inline-block rounded-full border-2 border-primary px-5 py-2 text-sm font-bold text-primary transition-all hover:-translate-y-0.5"
        >
          התחברו כדי לקבוע עמדה
        </Link>
      </div>
    );
  }

  function cast(next: Stance) {
    const prev = stance;
    setStance((cur) => (cur === next ? null : next)); // optimistic incl. retraction
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await setStanceAction({ voteId, stance: next });
        if (!res.ok) {
          setStance(prev); // rollback
          setMessage(res.message ?? "אירעה שגיאה — נסו שוב");
          return;
        }
        setStance(res.stance);
        setAggregate(res.aggregate);
        setProgress({ scoreableCount: res.scoreableCount, unlockThreshold: res.unlockThreshold });
      } catch {
        setStance(prev);
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  const pill = (value: Stance, label: string, selectedCls: string) => (
    <button
      type="button"
      onClick={() => cast(value)}
      disabled={pending}
      aria-pressed={stance === value}
      className={`flex-1 rounded-full border-2 px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-60 ${
        stance === value
          ? selectedCls
          : value === "for"
            ? "border-positive bg-positive-soft text-positive hover:-translate-y-0.5"
            : "border-negative bg-negative-soft text-negative hover:-translate-y-0.5"
      }`}
    >
      {label}
    </button>
  );

  const remaining = progress ? Math.max(0, progress.unlockThreshold - progress.scoreableCount) : null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold text-foreground">מה העמדה שלכם?</p>
      <div className="flex gap-3" role="group" aria-label="קביעת עמדה">
        {pill("for", stance === "for" ? "בעד ✓" : "בעד", "border-positive bg-positive text-positive-foreground")}
        {pill("against", stance === "against" ? "נגד ✓" : "נגד", "border-negative bg-negative text-negative-foreground")}
      </div>
      {stance != null && (
        <p className="mt-2 text-xs text-muted-foreground">לחיצה חוזרת על העמדה שבחרתם מוחקת אותה.</p>
      )}
      {message && <p className="mt-2 text-xs font-semibold text-negative">{message}</p>}
      {stance != null && aggregate && (
        <p className="mt-3 text-sm text-foreground">
          <span className="nums font-bold">{aggregate.forPct}%</span> מהקהילה בעד · מתוך{" "}
          <span className="nums">{aggregate.total}</span> עמדות
        </p>
      )}
      {stance != null && !aggregate && progress && (
        <p className="mt-3 text-xs text-muted-foreground">עוד אין מספיק עמדות בקהילה להצגת התפלגות.</p>
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
