import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { AGENDA_CONTAINER } from "./containers";

/** app/agenda — "על סדר היום": a hero band (most-imminent bill) + header + the
 *  redesigned feed cards (each with an initiator avatar cluster). Shape mirrors
 *  app/agenda/page.tsx so the skeleton can't drift from the page. */
export function AgendaSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="טוען את סדר היום">
      <span className="sr-only">טוען…</span>

      {/* hero band */}
      <section className="border-b border-border bg-muted">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <SkeletonCard className="h-56" />
        </div>
      </section>

      <main className={AGENDA_CONTAINER}>
        {/* heading */}
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-9 w-64" />
        <Skeleton className="mb-6 mt-3 h-6 w-full max-w-xl" />
        {/* feed cards */}
        <div className="grid gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonCard key={i} className="h-36" />
          ))}
        </div>
      </main>
    </div>
  );
}
