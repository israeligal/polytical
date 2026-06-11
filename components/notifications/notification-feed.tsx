"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationReadAction, markAllReadAction } from "@/app/actions/notifications";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/time";

export interface FeedItem {
  id: string;
  type:
    | "bet_won"
    | "market_resolved"
    | "suggestion_approved"
    | "suggestion_rejected"
    | "market_voided"
    | "market_closing_soon";
  titleHe: string;
  bodyHe: string;
  refMarketId: string | null;
  read: boolean;
  createdAtIso: string;
}

// Left-accent color per type: correct-guesses/approvals mint, rejections coral,
// resolved/voided neutral, closing-soon gold (call-to-action).
const ACCENT: Record<FeedItem["type"], string> = {
  bet_won: "border-s-positive",
  suggestion_approved: "border-s-positive",
  suggestion_rejected: "border-s-negative",
  market_resolved: "border-s-border",
  market_voided: "border-s-border",
  market_closing_soon: "border-s-accent",
};

export function NotificationFeed({ items }: { items: FeedItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open(item: FeedItem) {
    const href = item.refMarketId ? `/market/${item.refMarketId}` : "/profile";
    // Navigate first — marking-read is best-effort and must never block or abort
    // the navigation (a failed read-mark previously left the user stuck).
    if (!item.read) {
      startTransition(async () => {
        try {
          await markNotificationReadAction({ id: item.id });
        } catch {
          // best-effort; the click already navigated
        }
      });
    }
    router.push(href);
  }

  function readAll() {
    startTransition(async () => {
      await markAllReadAction();
      router.refresh();
    });
  }

  if (items.length === 0) {
    return <EmptyState>אין התראות עדיין. תנו מנדט על תחזית כדי להתחיל.</EmptyState>;
  }

  const hasUnread = items.some((i) => !i.read);

  return (
    <div className="space-y-3">
      {hasUnread && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={readAll}
            disabled={pending}
            className="font-accent text-sm font-bold text-blue transition-colors hover:text-foreground disabled:opacity-60"
          >
            סמנו הכל כנקרא
          </button>
        </div>
      )}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => open(item)}
              className={`flex w-full flex-col items-start gap-1 rounded-card border border-border border-s-4 ${ACCENT[item.type]} bg-card px-4 py-3 text-start transition-colors hover:bg-raised ${
                item.read ? "" : "ring-1 ring-blue/30"
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="font-bold text-foreground">{item.titleHe}</span>
                {!item.read && <span className="h-2 w-2 shrink-0 rounded-full bg-blue" />}
              </span>
              {/* wrap-anywhere: bodyHe can carry user text (e.g. a suggestion note) —
                  an unbroken long string must not blow the layout on mobile. */}
              <span className="min-w-0 max-w-full wrap-anywhere text-sm text-muted-foreground">{item.bodyHe}</span>
              <time dateTime={item.createdAtIso} className="font-accent text-xs text-muted-foreground">
                {formatDateTime(item.createdAtIso)}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
