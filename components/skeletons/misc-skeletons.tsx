// Skeletons for profile / search / notifications / market detail / markets feed.
// Each mirrors the real page's section order; the audit's findings per route are noted.

import { Skeleton, SkeletonCard } from "@/components/skeleton";
import {
  MARKET_CONTAINER,
  MARKET_GRID,
  MARKETS_PAGE_CONTAINER,
  NOTIFICATIONS_CONTAINER,
  PROFILE_CONTAINER,
  SEARCH_CONTAINER,
} from "./containers";

/** app/profile — avatar header, FOUR stat cards + match promo row, push
 *  settings block, open predictions, history. (Old skeleton had 6 stat cards
 *  and stopped before the settings/history sections.) */
export function ProfileSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען פרופיל" className={PROFILE_CONTAINER}>
      <span className="sr-only">טוען…</span>
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div>
          <Skeleton className="h-8 w-44" />
          <Skeleton className="mt-2 h-4 w-24" />
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonCard key={i} className="h-24" />
        ))}
      </div>
      <SkeletonCard className="mt-4 h-16" />

      {/* push settings + notification prefs */}
      <SkeletonCard className="mt-8 h-20 rounded-2xl" />

      {/* open predictions */}
      <Skeleton className="mt-10 mb-3 h-7 w-44" />
      <div className="space-y-3">
        {Array.from({ length: 2 }, (_, i) => (
          <SkeletonCard key={i} className="h-28 rounded-2xl" />
        ))}
      </div>

      {/* history */}
      <Skeleton className="mt-10 mb-3 h-7 w-48" />
      <div className="space-y-2">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonCard key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </main>
  );
}

/** app/search — models the NO-QUERY state (the common initial render): header
 *  + search box + the dashed "start typing" banner. (Old skeleton rendered a
 *  result grid that never appears on first load.) */
export function SearchSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען חיפוש" className={SEARCH_CONTAINER}>
      <span className="sr-only">טוען…</span>
      <header className="mb-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 mb-4 h-9 w-56" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </header>
      <SkeletonCard className="h-44 rounded-card border-dashed" />
    </main>
  );
}

/** app/notifications — header, enable-push banner slot, feed rows. */
export function NotificationsSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען התראות" className={NOTIFICATIONS_CONTAINER}>
      <span className="sr-only">טוען…</span>
      <header className="mb-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-2 h-9 w-36" />
      </header>
      <SkeletonCard className="mb-6 h-16 rounded-2xl" />
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonCard key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    </main>
  );
}

/** app/markets — h1 bar + category-rail pill row + 3-col market card grid. */
export function MarketsPageSkeleton() {
  return (
    <main
      role="status"
      aria-busy="true"
      aria-label="טוען תחזיות"
      className={MARKETS_PAGE_CONTAINER}
    >
      <span className="sr-only">טוען…</span>
      {/* h1 */}
      <Skeleton className="mb-6 h-10 w-36" />
      {/* CategoryRail pill strip */}
      <div className="mb-6 flex gap-2 overflow-x-hidden pb-1">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-20 shrink-0 rounded-full" />
        ))}
      </div>
      {/* 3-col card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} className="h-44 rounded-card" />
        ))}
      </div>
    </main>
  );
}

/** app/market/[id] — head column + sticky aside; binary markets show ONE
 *  full-width odds card (the old skeleton's 2-up outcome grid never exists). */
export function MarketSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען תחזית" className={MARKET_CONTAINER}>
      <span className="sr-only">טוען…</span>
      <Skeleton className="mb-5 h-4 w-32" />
      <div className={MARKET_GRID}>
        <div className="min-w-0">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-3 h-10 w-full max-w-lg" />
          <Skeleton className="mt-2 h-4 w-56" />
          <SkeletonCard className="mt-6 h-32 rounded-2xl" />
        </div>
        <aside className="min-w-0">
          <SkeletonCard className="h-80 rounded-2xl" />
        </aside>
        <div className="min-w-0 lg:col-start-1">
          <Skeleton className="mb-3 h-6 w-44" />
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard className="h-64 rounded-card" />
            <SkeletonCard className="h-64 rounded-card" />
          </div>
          <Skeleton className="mt-8 mb-3 h-6 w-32" />
          <SkeletonCard className="h-32 rounded-xl" />
        </div>
      </div>
    </main>
  );
}
