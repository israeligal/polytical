// "על סדר היום" pre-vote surfaces — the feed card + the shared bits the hero
// (components/hero.tsx → AgendaHeroSpotlight) reuses. RSC-safe, presentational:
// the k-anon gate on the community split is applied upstream (the page passes a
// nulled-out forPct when the count is below threshold). RTL + design tokens.

import Link from "next/link";
import type { AgendaFeedItem, AgendaInitiator } from "@/app/lib/agenda/read-repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { PoliticianPortrait } from "@/components/politician-portrait";
import { Clock, ChevronForward } from "@/components/icons";
import { formatDate } from "@/lib/time";

export type AgendaStance = "for" | "against";

/** Community position split passed down already k-gated: forPct null = withheld. */
export interface AgendaCommunity {
  forPct: number | null;
  total: number;
}

/** Overlapping caricature cluster of the bill's proposing MKs + a "by …" label.
 *  `total` is the true initiator count (drives the "+N" beyond the avatars shown). */
export function InitiatorCluster({
  initiators,
  total,
  size = "sm",
}: {
  initiators: AgendaInitiator[];
  total: number;
  size?: "sm" | "md";
}) {
  if (initiators.length === 0) return null;
  const lead = initiators[0];
  const extra = total - 1; // beyond the lead, by name
  const avatar = size === "md" ? "h-11 w-11" : "h-9 w-9";
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex shrink-0 flex-row items-center">
        {initiators.map((p, i) => (
          <div
            key={p.personId}
            className={`${i > 0 ? "-ms-3" : ""} rounded-full ring-2 ring-card`}
            style={{ zIndex: initiators.length - i }}
          >
            <span className={`block overflow-hidden rounded-full ${avatar}`}>
              <PoliticianPortrait politician={dbToCard(p)} size="sm" />
            </span>
          </div>
        ))}
      </div>
      <span className="min-w-0 truncate text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{lead.nameHe}</span>
        {extra > 0 && <> ועוד {extra}</>}
      </span>
    </div>
  );
}

/** Slim two-segment בעד/נגד community bar. Renders only when un-gated (forPct set). */
export function AgendaSplitBar({ forPct, className }: { forPct: number; className?: string }) {
  return (
    <div
      className={`flex h-2 overflow-hidden rounded-full bg-negative/70${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={`${forPct}% מהקהילה בעד`}
    >
      <div className="h-full bg-positive transition-[width] duration-500 ease-out" style={{ width: `${forPct}%` }} />
    </div>
  );
}

/** The community line under the split bar: "62% בעד · 21 עמדות", or a nudge. */
function CommunityLine({ community }: { community: AgendaCommunity }) {
  if (community.forPct == null) {
    return (
      <span className="text-xs text-muted-foreground">
        {community.total > 0 ? `${community.total} עמדות עד כה — היו הראשונים לחשוף את הרוב` : "טרם נקבעו עמדות — קבעו ראשונים"}
      </span>
    );
  }
  return (
    <span className="nums text-xs text-muted-foreground">
      <span className="font-bold text-positive">{community.forPct}% בעד</span> · {community.total} עמדות
    </span>
  );
}

/** A user's own pre-vote, as a soft chip. */
function MyStanceChip({ mine }: { mine: AgendaStance }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
        mine === "for" ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative"
      }`}
    >
      העמדה שלכם: {mine === "for" ? "בעד" : "נגד"}
    </span>
  );
}

export function AgendaCard({
  item,
  community,
  mine,
}: {
  item: AgendaFeedItem;
  community: AgendaCommunity;
  mine: AgendaStance | null;
}) {
  return (
    <Link
      href={item.billId != null ? `/bill/${item.billId}` : "/agenda"}
      className="group flex flex-col rounded-card border border-border bg-card p-4 shadow-2 transition-all duration-200 ease-out hover:-translate-y-1 hover:border-primary/40 hover:shadow-3 sm:p-5"
    >
      <div className="mb-2.5 flex items-center gap-2 text-xs text-muted-foreground">
        {item.statusDescHe && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-1 font-semibold text-foreground">
            {item.statusDescHe}
          </span>
        )}
        {item.expectedDate && (
          <span className="nums ms-auto inline-flex shrink-0 items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            צפוי: {formatDate(`${item.expectedDate}T00:00:00Z`)}
          </span>
        )}
      </div>

      <h3 className="line-clamp-2 font-display text-lg font-extrabold leading-snug text-foreground transition-colors group-hover:text-primary">
        {item.titleHe}
      </h3>

      {item.initiators.length > 0 && (
        <div className="mt-3">
          <InitiatorCluster initiators={item.initiators} total={item.initiatorCount} />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {community.forPct != null && <AgendaSplitBar forPct={community.forPct} />}
        <div className="flex items-center justify-between gap-3">
          <CommunityLine community={community} />
          {mine ? (
            <MyStanceChip mine={mine} />
          ) : (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-bold text-primary">
              קבעו עמדה
              <ChevronForward className="h-3.5 w-3.5 -scale-x-100 transition-transform group-hover:-translate-x-0.5" />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
