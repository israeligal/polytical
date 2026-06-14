import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { AGENDA_CONTAINER } from "./containers";

/** app/agenda — "על סדר היום" feed: header + a list of upcoming-bill rows. */
export function AgendaSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען את סדר היום" className={AGENDA_CONTAINER}>
      <span className="sr-only">טוען…</span>
      {/* heading */}
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-9 w-56" />
      <Skeleton className="mb-6 mt-3 h-5 w-full max-w-xl" />
      {/* feed rows */}
      <div className="grid gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} className="h-24" />
        ))}
      </div>
    </main>
  );
}
