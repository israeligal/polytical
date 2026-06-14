"use client";

// עמדה מראש widget — pre-vote בעד/נגד on an upcoming bill, mirroring StanceWidget
// (optimistic toggle with rollback; tapping the selected pill retracts — privacy).
// Unlike a post-vote stance there's no match-unlock progress: a pre-vote only
// counts toward "מי מצביע כמוכם" once the plenum vote happens and the resolution
// sweep adopts it. Aggregate renders from the server response only.

import Link from "next/link";
import { useState, useTransition } from "react";
import { setAgendaStanceAction } from "@/app/actions/agenda-stances";

type Stance = "for" | "against";

export function AgendaStanceWidget({
  agendaItemId,
  billId,
  initialStance,
  initialAggregate = null,
  loggedIn,
}: {
  agendaItemId: string;
  billId: number | null;
  initialStance: Stance | null;
  /** Server-seeded so a returning user sees the aggregate immediately. */
  initialAggregate?: { forPct: number; total: number } | null;
  loggedIn: boolean;
}) {
  const [stance, setStance] = useState<Stance | null>(initialStance);
  const [aggregate, setAggregate] = useState<{ forPct: number; total: number } | null>(initialAggregate);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const backTo = billId != null ? `/bill/${billId}` : "/agenda";

  if (!loggedIn) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-sm font-semibold text-foreground">ההצעה בדרך להצבעה — מה העמדה שלכם?</p>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(backTo)}`}
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
        const res = await setAgendaStanceAction({ agendaItemId, billId: billId ?? undefined, stance: next });
        if (!res.ok) {
          setStance(prev); // rollback
          setMessage(res.message ?? "אירעה שגיאה — נסו שוב");
          return;
        }
        setStance(res.stance);
        setAggregate(res.aggregate);
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

  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-4">
      <p className="mb-1 text-sm font-semibold text-foreground">ההצעה בדרך להצבעה — מה העמדה שלכם?</p>
      <p className="mb-3 text-xs text-muted-foreground">העמדה שלכם תיספר כעמדה רגילה כשתתקיים ההצבעה במליאה.</p>
      <div className="flex gap-3" role="group" aria-label="קביעת עמדה מראש">
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
      {stance != null && !aggregate && (
        <p className="mt-3 text-xs text-muted-foreground">עוד אין מספיק עמדות בקהילה להצגת התפלגות.</p>
      )}
    </div>
  );
}
