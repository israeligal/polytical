"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Market, Outcome, Politician } from "@/lib/types";
import { pct } from "@/lib/format";
import { catTint } from "@/lib/cat";
import { makePredictionAction } from "@/app/actions/bet";
import { PoliticianPortrait } from "@/components/politician-portrait";

/**
 * The multi-market picker: one Polymarket-style row per candidate outcome —
 * portrait (when the outcome IS a politician), label, crowd share and a pick
 * button — sorted by popularity. Each row's share is painted as an animated
 * tinted fill behind the content (the outcome's categorical color), so the
 * whole list reads as a horizontal bar chart you can vote on. Picking submits
 * immediately (one pick per market, changeable until close — same upsert as
 * the binary BetPanel); the current pick is highlighted.
 */
export function OutcomeRows({
  market,
  politicians,
  initialPickId,
  isLoggedIn,
}: {
  market: Market;
  politicians: Politician[];
  initialPickId: string | null;
  isLoggedIn: boolean;
}) {
  const [pickedId, setPickedId] = useState<string | null>(initialPickId);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  const total = market.outcomes.reduce((sum, o) => sum + o.predictors, 0);
  // Popularity order, ties by the admin's ordinal order (sort is stable).
  const sorted = [...market.outcomes].sort((a, b) => b.predictors - a.predictors);
  const byPersonId = new Map(politicians.map((p) => [p.id, p]));

  function pick(outcome: Outcome) {
    const previous = pickedId;
    setPickedId(outcome.id); // optimistic — reverted if the action fails
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await makePredictionAction({ marketId: market.id, outcomeId: outcome.id });
        setOk(res.ok);
        setMessage(res.ok ? "הניחוש נרשם!" : (res.message ?? "שגיאה"));
        if (!res.ok) setPickedId(previous);
      } catch {
        setOk(false);
        setMessage("אירעה שגיאה — נסו שוב");
        setPickedId(previous);
      }
    });
  }

  return (
    <div className="rounded-card border border-border bg-card shadow-2">
      <p className="border-b border-border px-5 py-3 text-sm text-muted-foreground">
        בחרו תשובה אחת — אפשר לשנות עד הסגירה
      </p>
      <ul>
        {sorted.map((o) => {
          const politician = o.personId != null ? byPersonId.get(String(o.personId)) : undefined;
          const share = pct(o.predictors, total);
          const active = o.id === pickedId;
          return (
            <li
              key={o.id}
              className="relative overflow-hidden border-b border-border last:border-b-0 last:rounded-b-card first:rounded-t-none"
            >
              {/* The crowd share as a tinted fill behind the row content — the
                  list doubles as the chart, animating like the OddsBar. */}
              <div
                aria-hidden
                className={`absolute inset-y-0 start-0 transition-[width] duration-500 ease-out ${catTint[o.color ?? 1]}`}
                style={{ width: `${share}%` }}
              />
              <div className="relative flex items-center gap-3 px-4 py-3 sm:px-5">
                {politician && (
                  <Link href={`/politician/${politician.id}`} className="shrink-0">
                    <PoliticianPortrait politician={politician} size="sm" />
                  </Link>
                )}
                <span className="min-w-0 flex-1 truncate font-sans text-[15px] font-extrabold text-foreground sm:text-base">
                  {o.label}
                </span>
                <span className="shrink-0 text-end">
                  <span className="nums block font-display text-xl font-black text-foreground sm:text-2xl">
                    {o.predictors > 0 && share === 0 ? "<1%" : `${share}%`}
                  </span>
                  <span className="nums block text-xs text-muted-foreground">
                    {o.predictors} ניחושים
                  </span>
                </span>
                {isLoggedIn ? (
                  <button
                    type="button"
                    onClick={() => pick(o)}
                    disabled={pending}
                    aria-pressed={active}
                    className={`shrink-0 rounded-[12px] border-[1.5px] px-4 py-2 text-sm font-extrabold transition-all duration-150 disabled:opacity-45 ${
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-glow-mint"
                        : "border-border bg-sunken text-foreground hover:border-primary hover:text-primary"
                    }`}
                  >
                    {active ? "הניחוש שלך ✓" : "בחר"}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="shrink-0 rounded-[12px] border-[1.5px] border-border bg-sunken px-4 py-2 text-sm font-extrabold text-foreground transition-all duration-150 hover:border-primary hover:text-primary"
                  >
                    בחר
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {message && (
        <p
          role="status"
          className={`border-t border-border px-5 py-2.5 text-center text-sm font-semibold ${
            ok ? "text-positive" : "text-negative"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
