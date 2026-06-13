import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { BILL_CONTAINER } from "./containers";

/** app/bill/[billId] — back link, title, meta grid, initiators, documents. */
export function BillSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען הצעת חוק" className={BILL_CONTAINER}>
      <span className="sr-only">טוען…</span>
      {/* back link */}
      <Skeleton className="mb-5 h-4 w-32" />
      {/* title */}
      <Skeleton className="mt-6 h-8 w-3/4" />
      {/* meta grid */}
      <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-card p-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-4 w-28" />
          </div>
        ))}
      </div>
      {/* initiators */}
      <Skeleton className="mt-8 mb-3 h-6 w-40" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      {/* documents */}
      <Skeleton className="mt-8 mb-3 h-6 w-32" />
      <div className="space-y-2">
        {Array.from({ length: 2 }, (_, i) => (
          <SkeletonCard key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    </main>
  );
}
