import Link from "next/link";
import type { Market, Politician } from "@/lib/types";
import { formatCount, pct, pctLabel, timeUntil } from "@/lib/format";
import { catTint } from "@/lib/cat";
import { CategoryBadge, HotBadge } from "@/components/badges";
import { OddsBar } from "@/components/odds-bar";
import { PoliticianPortrait } from "@/components/politician-portrait";
import { Clock, Flame, Users } from "@/components/icons";

/**
 * Polymarket-style content-first hero: no marketing copy — the markets ARE the
 * hero. `HeroSpotlight` is the big featured-market panel (read-only outcome
 * rows; the whole panel links to the market page). `HotRail` is the ranked
 * "hot now" side list of the most-active markets.
 */

const MAX_SPOTLIGHT_ROWS = 4;

export function HeroSpotlight({
  market,
  featured,
  badge,
}: {
  market: Market;
  featured: Politician[];
  badge: string;
}) {
  const total = market.outcomes.reduce((sum, o) => sum + o.predictors, 0);
  const sorted = [...market.outcomes].sort((a, b) => b.predictors - a.predictors);
  const top = sorted.slice(0, MAX_SPOTLIGHT_ROWS);
  const rest = sorted.length - top.length;
  const byPersonId = new Map(featured.map((p) => [p.id, p]));

  return (
    <Link
      href={`/market/${market.id}`}
      className="group flex flex-col rounded-card border border-border bg-card p-5 shadow-2 transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-3 hover:shadow-glow-mint sm:p-6"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CategoryBadge category={market.category} />
        {market.hot && <HotBadge />}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 font-accent text-xs font-bold text-accent-foreground">
          {badge}
        </span>
        <span className="ms-auto inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {timeUntil(market.closeAt)}
        </span>
      </div>

      <h2 className="mb-4 font-display text-2xl font-black leading-tight text-foreground transition-colors group-hover:text-primary sm:text-3xl">
        {market.question}
      </h2>

      {market.type === "binary" ? (
        <OddsBar market={market} />
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border">
          {top.map((o) => {
            const politician =
              o.personId != null ? byPersonId.get(String(o.personId)) : undefined;
            return (
              <li
                key={o.id}
                className="relative overflow-hidden border-b border-border last:border-b-0"
              >
                <div
                  aria-hidden
                  className={`absolute inset-y-0 start-0 transition-[width] duration-500 ease-out ${catTint[o.color ?? 1]}`}
                  style={{ width: `${pct(o.predictors, total)}%` }}
                />
                <div className="relative flex items-center gap-3 px-3.5 py-2.5">
                  {politician && <PoliticianPortrait politician={politician} size="sm" />}
                  <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-foreground">
                    {o.label}
                  </span>
                  <span className="nums shrink-0 font-display text-xl font-black text-foreground">
                    {pctLabel(o.predictors, total)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rest > 0 && (
        <p className="nums mt-2 text-sm font-bold text-muted-foreground">
          {rest === 1 ? "ועוד אפשרות אחת" : `ועוד ${rest} אפשרויות`}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-[18px] w-[18px]" />
            <span className="nums font-extrabold text-gold">{formatCount(total)}</span>
            מנחשים
          </span>
        </div>
        <span className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-colors group-hover:bg-primary-hover">
          לנחש עכשיו
        </span>
      </div>
    </Link>
  );
}

export function HotRail({
  items,
}: {
  items: { market: Market; predictors: number; leaderPct: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <aside className="flex flex-col rounded-card border border-border bg-card shadow-2">
      <p className="flex items-center gap-1.5 border-b border-border px-4 py-3 font-accent text-sm font-bold text-foreground">
        <Flame className="h-4 w-4 text-gold" />
        חם עכשיו
      </p>
      <ul className="flex-1">
        {items.map(({ market, predictors, leaderPct }, i) => (
          <li key={market.id} className="border-b border-border last:border-b-0">
            <Link
              href={`/market/${market.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-raised"
            >
              <span className="nums w-4 shrink-0 font-display text-lg font-black text-text-low">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-foreground">
                  {market.question}
                </span>
                <span className="nums block text-xs text-muted-foreground">
                  {formatCount(predictors)} מנחשים
                </span>
              </span>
              <span className="nums shrink-0 text-sm font-extrabold text-foreground">
                {leaderPct}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="#markets"
        className="border-t border-border px-4 py-3 text-center text-sm font-bold text-primary transition-colors hover:bg-raised"
      >
        כל התחזיות
      </Link>
    </aside>
  );
}
