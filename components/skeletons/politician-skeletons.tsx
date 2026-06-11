// Skeletons for politician surfaces. The detail skeleton now includes the
// ownership widget, recent-bills list, the votes record and a markets stack —
// all sections the audit found missing (each one was a content jump).

import { Skeleton, SkeletonCard } from "@/components/skeleton";
import {
  COLLECTION_CONTAINER, POLITICIANS_CONTAINER, POLITICIANS_GRID, POLITICIAN_CONTAINER, POLITICIAN_GRID,
} from "./containers";

/** app/politician/[id] — sticky card column + the full right-column stack. */
export function PoliticianSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען פוליטיקאי" className={POLITICIAN_CONTAINER}>
      <span className="sr-only">טוען…</span>
      <Skeleton className="mb-5 h-4 w-36" />
      <div className={POLITICIAN_GRID}>
        {/* sticky card column: caricature + ownership/progress widget */}
        <div>
          <SkeletonCard className="aspect-[3/4] rounded-card" />
          <SkeletonCard className="mt-4 h-20 rounded-2xl" />
        </div>

        <div>
          <Skeleton className="h-9 w-64" />
          <Skeleton className="mt-2 h-4 w-44" />

          {/* facts grid */}
          <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="bg-card p-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-4 w-28" />
              </div>
            ))}
          </div>

          {/* parliamentary activity: 2 stat tiles + recent bills */}
          <Skeleton className="mt-8 mb-3 h-6 w-40" />
          <div className="grid grid-cols-2 gap-4">
            <SkeletonCard className="h-24" />
            <SkeletonCard className="h-24" />
          </div>
          <Skeleton className="mt-5 mb-2 h-4 w-36" />
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonCard key={i} className="h-10 rounded-lg" />
            ))}
          </div>

          {/* הצבעות אחרונות — two for/against columns */}
          <Skeleton className="mt-8 mb-3 h-6 w-36" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }, (_, col) => (
              <div key={col}>
                <Skeleton className="mb-2 h-4 w-24" />
                <div className="grid gap-2">
                  {Array.from({ length: 3 }, (_, i) => (
                    <SkeletonCard key={i} className="h-16 rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* markets */}
          <Skeleton className="mt-8 mb-3 h-6 w-48" />
          <div className="grid gap-4">
            <SkeletonCard className="h-44 rounded-card" />
          </div>
        </div>
      </div>
    </main>
  );
}

/** app/politicians — search box + count line + 3-col caricature grid. */
export function PoliticiansSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען פוליטיקאים" className={POLITICIANS_CONTAINER}>
      <span className="sr-only">טוען…</span>
      <Skeleton className="mb-5 h-4 w-28" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-2 h-9 w-64" />
      <Skeleton className="mt-2 h-5 w-full max-w-2xl" />
      <Skeleton className="mt-6 h-11 w-full max-w-md rounded-lg" />
      <Skeleton className="mt-4 mb-4 h-4 w-28" />
      <div className={POLITICIANS_GRID}>
        {Array.from({ length: 9 }, (_, i) => (
          <SkeletonCard key={i} className="h-72 rounded-card" />
        ))}
      </div>
    </main>
  );
}

/** app/collection — back link, header block, caricature grid (~120 cards). */
export function CollectionSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען את האוסף" className={COLLECTION_CONTAINER}>
      <span className="sr-only">טוען…</span>
      <Skeleton className="mb-5 h-4 w-28" />
      <div className="mb-8 max-w-2xl">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-10 w-48" />
        <Skeleton className="mt-3 h-5 w-full" />
        <Skeleton className="mt-1 h-5 w-3/4" />
      </div>
      <div className={POLITICIANS_GRID}>
        {Array.from({ length: 9 }, (_, i) => (
          <SkeletonCard key={i} className="h-72 rounded-card" />
        ))}
      </div>
    </main>
  );
}
