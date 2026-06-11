"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Market } from "@/lib/types";
import { pct } from "@/lib/format";
import { makePredictionAction } from "@/app/actions/bet";

/**
 * Interactive prediction panel: pick ONE outcome and lock in a (stake-less)
 * prediction via the server action. You can change your pick until the market
 * closes — the action upserts one prediction per market. The percentage on each
 * outcome is the crowd split (share of predictors), not odds or money.
 *
 * `isLoggedIn` is passed from the server page; logged-out users see a sign-in
 * link instead of the predict button (the action also re-checks the session).
 */
export function BetPanel({
  market,
  isLoggedIn,
}: {
  market: Market;
  isLoggedIn: boolean;
}) {
  const total = market.outcomes.reduce((sum, o) => sum + o.predictors, 0);
  const [outcomeId, setOutcomeId] = useState<string>(market.outcomes[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  const selected = market.outcomes.find((o) => o.id === outcomeId) ?? market.outcomes[0];

  function submit() {
    if (!selected) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await makePredictionAction({ marketId: market.id, outcomeId: selected.id });
        setOk(res.ok);
        setMessage(res.ok ? "המנדט נרשם!" : res.message ?? "שגיאה");
      } catch {
        setOk(false);
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  return (
    <div className="rounded-card border border-border bg-card p-5 shadow-2">
      <h3 className="mb-1 font-display text-xl text-foreground">המנדט שלך</h3>
      <p className="mb-3 text-sm text-muted-foreground">בחרו תוצאה אחת — אפשר לשנות עד הסגירה</p>

      <div className="flex flex-wrap gap-2">
        {market.outcomes.map((o, i) => {
          const active = o.id === outcomeId;
          const tone =
            market.type === "binary"
              ? i === 0
                ? active
                  ? "border-positive bg-positive text-primary-foreground"
                  : "border-positive bg-positive-soft text-positive"
                : active
                  ? "border-negative bg-negative text-primary-foreground"
                  : "border-negative bg-negative-soft text-negative"
              : active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-sunken text-foreground";
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setOutcomeId(o.id)}
              aria-pressed={active}
              className={`rounded-[12px] border-[1.5px] px-3 py-1.5 text-sm font-extrabold transition-colors ${tone}`}
            >
              {o.label} <span className="nums opacity-70">{pct(o.predictors, total)}%</span>
            </button>
          );
        })}
      </div>

      {isLoggedIn ? (
        <button
          type="button"
          onClick={submit}
          disabled={pending || !selected}
          className="mt-4 w-full rounded-[12px] bg-primary py-3 font-extrabold text-primary-foreground transition-all duration-150 hover:bg-primary-hover hover:shadow-glow-mint disabled:cursor-not-allowed disabled:opacity-45"
        >
          {pending ? "רושם…" : "תנו מנדט"}
        </button>
      ) : (
        <Link
          href="/login"
          className="mt-4 block w-full rounded-[12px] bg-primary py-3 text-center font-extrabold text-primary-foreground transition-all duration-150 hover:bg-primary-hover hover:shadow-glow-mint"
        >
          התחברו כדי לתת מנדט
        </Link>
      )}

      {message && (
        <p
          role="status"
          className={`mt-3 text-center text-sm font-semibold ${
            ok ? "text-positive" : "text-negative"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
