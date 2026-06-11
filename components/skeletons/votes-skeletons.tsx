// Skeletons for the votes surfaces. Each mirrors its page's REAL section
// order — the audit found the feed skeleton predated the featured rail and
// the detail skeleton was missing the StanceWidget (the page's primary
// engagement surface).

import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { MY_MATCH_CONTAINER, VOTES_PAGE_CONTAINER, VOTE_PAGE_CONTAINER } from "./containers";

/** app/votes — flex header w/ freshness stamp, featured rail, feed rows. */
export function VotesFeedSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען הצבעות" className={VOTES_PAGE_CONTAINER}>
      <span className="sr-only">טוען…</span>
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-9 w-64" />
        </div>
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="mb-6 h-5 w-full max-w-xl" />

      {/* featured rail (renders whenever admin-featured votes exist) */}
      <Skeleton className="mb-3 h-6 w-32" />
      <div className="mb-8 grid gap-3">
        {Array.from({ length: 2 }, (_, i) => (
          <SkeletonCard key={i} className="h-28" />
        ))}
      </div>

      <Skeleton className="mb-3 h-6 w-36" />
      <div className="grid gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} className="h-28" />
        ))}
      </div>
    </main>
  );
}

/** app/vote/[id] — title+chip flex row, meta, STANCE WIDGET, totals card,
 *  faction breakdown cards (tall, 2-col member grids), siblings list. */
export function VoteDetailSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען הצבעה" className={VOTE_PAGE_CONTAINER}>
      <span className="sr-only">טוען…</span>
      <Skeleton className="mb-5 h-4 w-24" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-8 w-full max-w-lg" />
          <Skeleton className="mt-2 h-8 w-2/3" />
        </div>
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-4 w-72" />

      {/* stance widget (decisive votes — the common case from the feed) */}
      <SkeletonCard className="mt-4 h-32" />

      {/* totals card */}
      <SkeletonCard className="mt-6 h-28 rounded-2xl" />

      {/* faction breakdown — tall cards with 2-col member rows inside */}
      <Skeleton className="mt-8 mb-3 h-6 w-32" />
      <div className="grid gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <Skeleton className="mb-3 h-4 w-40" />
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, j) => (
                <Skeleton key={j} className="h-11 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* sibling votes */}
      <Skeleton className="mt-8 mb-3 h-6 w-56" />
      <div className="grid gap-2">
        {Array.from({ length: 2 }, (_, i) => (
          <SkeletonCard key={i} className="h-10 rounded-lg" />
        ))}
      </div>
    </main>
  );
}

/** app/my-match — models the LOCKED state (the most common first visit):
 *  header + description, one full-width centered card, party section stub.
 *  The old skeleton showed a 2-col panels grid that most visitors never get. */
export function MyMatchSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען התאמה" className={MY_MATCH_CONTAINER}>
      <span className="sr-only">טוען…</span>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-9 w-72" />
      <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      <Skeleton className="mb-8 h-5 w-2/3 max-w-md" />

      <SkeletonCard className="h-56 rounded-2xl border-dashed" />

      <Skeleton className="mt-10 mb-3 h-6 w-40" />
      <div className="grid gap-3 sm:grid-cols-2">
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-24" />
      </div>
    </main>
  );
}
