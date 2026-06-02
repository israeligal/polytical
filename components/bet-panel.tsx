"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Market } from "@/lib/types";
import { formatCoins, pct, totalPool } from "@/lib/format";
import { MIN_BET } from "@/app/lib/economy";
import { placeBetAction } from "@/app/actions/bet";
import { Coin } from "@/components/icons";

const QUICK_STAKES = [10, 50, 100] as const;

/**
 * Interactive parimutuel bet panel: pick an outcome, set a stake, see the
 * potential payout *at current odds*, and place a real bet via the server
 * action. Odds and payout are indicative — the actual payout is computed from
 * the FINAL pools on resolution (final-odds parimutuel).
 *
 * `isLoggedIn` is passed from the server page; logged-out users see a sign-in
 * link instead of the place-bet button (the action also re-checks the session).
 */
export function BetPanel({
  market,
  isLoggedIn,
}: {
  market: Market;
  isLoggedIn: boolean;
}) {
  const total = totalPool(market.outcomes);
  const [outcomeId, setOutcomeId] = useState<string>(market.outcomes[0]?.id ?? "");
  const [stake, setStake] = useState<number>(100);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  const selected = market.outcomes.find((o) => o.id === outcomeId) ?? market.outcomes[0];

  // Indicative payout at CURRENT odds: your stake joins the chosen pool, then
  // claims your share of the new grand total. Final payout uses resolution-time
  // pools, so this is a live estimate, not a promise.
  const validStake = Number.isInteger(stake) && stake >= MIN_BET;
  const potential =
    selected && validStake
      ? Math.floor(((total + stake) * stake) / (selected.pool + stake))
      : 0;

  function submit() {
    if (!selected || !validStake) {
      setOk(false);
      setMessage(`הסכום נמוך מהמינימום (${MIN_BET})`);
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await placeBetAction({
          marketId: market.id,
          outcomeId: selected.id,
          amount: stake,
        });
        setOk(res.ok);
        setMessage(res.ok ? "ההימור נרשם!" : res.message ?? "שגיאה");
      } catch {
        setOk(false);
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <h3 className="mb-3 font-display text-lg font-bold text-foreground">הימור</h3>

      <div className="flex flex-wrap gap-2">
        {market.outcomes.map((o, i) => {
          const active = o.id === outcomeId;
          const tone =
            market.type === "binary"
              ? i === 0
                ? active
                  ? "border-positive bg-positive text-white"
                  : "border-positive text-positive"
                : active
                  ? "border-negative bg-negative text-white"
                  : "border-negative text-negative"
              : active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground";
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setOutcomeId(o.id)}
              aria-pressed={active}
              className={`rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition-colors ${tone}`}
            >
              {o.label} <span className="nums opacity-70">{pct(o.pool, total)}%</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg bg-muted px-3 py-2.5">
        <label className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">סכום</span>
          <span className="inline-flex items-center gap-1.5">
            <Coin className="h-4 w-4 text-accent" />
            <input
              type="number"
              inputMode="numeric"
              min={MIN_BET}
              value={stake}
              onChange={(e) => setStake(Math.floor(Number(e.target.value)) || 0)}
              className="nums w-24 bg-transparent text-end text-lg font-black text-foreground outline-none"
            />
          </span>
        </label>
        <div className="mt-2 flex gap-2">
          {QUICK_STAKES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setStake(c)}
              className={`nums rounded-md px-2.5 py-1 text-xs font-bold ring-1 transition-colors ${
                stake === c
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "bg-card text-muted-foreground ring-border hover:ring-primary"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">תשלום פוטנציאלי</span>
        <span className="nums font-black text-positive">+{formatCoins(potential)}</span>
      </div>

      {isLoggedIn ? (
        <button
          type="button"
          onClick={submit}
          disabled={pending || !validStake}
          className="mt-4 w-full rounded-lg bg-primary py-3 font-bold text-primary-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {pending ? "רושם…" : "הניחו ניחוש"}
        </button>
      ) : (
        <Link
          href="/login"
          className="mt-4 block w-full rounded-lg bg-primary py-3 text-center font-bold text-primary-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-hover"
        >
          התחברו כדי להמר
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
