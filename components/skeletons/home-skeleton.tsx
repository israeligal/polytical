// Mirrors app/page.tsx section-for-section: hero (muted) → markets (plain,
// w/ CategoryRail strip) → politicians (muted) → leaderboard (plain) →
// knesset votes (muted). The old skeleton stopped at 3 sections — every load
// double-jumped when leaderboard + votes streamed in.

import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { HOME_SECTION_INNER } from "./containers";

export function HomeSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען את פוליטיקל" className="flex-1">
      <span className="sr-only">טוען…</span>

      {/* HERO — muted band, text column + featured card */}
      <section className="border-b border-border bg-muted">
        <div className={HOME_SECTION_INNER}>
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div className="min-w-0">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="mt-3 h-12 w-full max-w-md" />
              <Skeleton className="mt-2 h-12 w-3/4" />
              <Skeleton className="mt-5 h-5 w-full max-w-xl" />
              <div className="mt-6 flex gap-3">
                <Skeleton className="h-12 w-40 rounded-lg" />
                <Skeleton className="h-12 w-40 rounded-lg" />
              </div>
            </div>
            <div>
              <Skeleton className="mb-2 h-7 w-44 rounded-full" />
              <SkeletonCard className="h-64 rounded-card" />
            </div>
          </div>
        </div>
      </section>

      {/* MARKETS — heading + CategoryRail strip + 2-col card grid */}
      <section className={HOME_SECTION_INNER}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-8 w-64" />
        <Skeleton className="mt-6 mb-6 h-10 w-full max-w-lg rounded-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i} className="h-52 rounded-card" />
          ))}
        </div>
      </section>

      {/* POLITICIANS — muted band, 3-col caricature grid */}
      <section className="border-y border-border bg-muted">
        <div className={HOME_SECTION_INNER}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-8 w-72" />
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonCard key={i} className="h-72 rounded-card" />
            ))}
          </div>
        </div>
      </section>

      {/* LEADERBOARD — narrow rows list */}
      <section className={HOME_SECTION_INNER}>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-2 h-8 w-56" />
        <div className="mx-auto mt-6 max-w-2xl space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonCard key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      </section>

      {/* KNESSET VOTES — muted band, narrow vote rows */}
      <section className="border-t border-border bg-muted">
        <div className={HOME_SECTION_INNER}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-8 w-72" />
          <div className="mx-auto mt-6 grid max-w-2xl gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonCard key={i} className="h-28" />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
