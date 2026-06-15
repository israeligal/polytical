import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { GROUPS_CONTAINER, GROUP_CONTAINER } from "./containers";

/** app/g — "my groups" list: header + a column of group cards. */
export function GroupsListSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען קואליציות" className={GROUPS_CONTAINER}>
      <span className="sr-only">טוען…</span>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-9 w-40" />
        </div>
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonCard key={i} className="h-16" />
        ))}
      </div>
    </main>
  );
}

/** app/g/[slug] — coalition MANAGEMENT page: header + action bar, the
 *  enter-feed / post-motion buttons, then scoreboard + roster + stance toggle
 *  in a single column (the motions feed moved to the global scoped feed). */
export function GroupHomeSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען קואליציה" className={GROUP_CONTAINER}>
      <span className="sr-only">טוען…</span>
      {/* header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-36 rounded-lg" />
          ))}
        </div>
      </div>
      {/* enter-feed + post-motion buttons */}
      <div className="mb-8 flex flex-wrap gap-3">
        <Skeleton className="h-10 w-44 rounded-full" />
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>
      {/* scoreboard + roster + stance toggle (single column) */}
      <div className="space-y-6">
        <SkeletonCard className="h-48" />
        <SkeletonCard className="h-40" />
        <SkeletonCard className="h-24" />
      </div>
    </main>
  );
}

/** app/g/new, /g/[slug]/new, /g/join/[code] — a single form/preview card. */
export function GroupFormSkeleton() {
  return (
    <main role="status" aria-busy="true" aria-label="טוען טופס" className={GROUPS_CONTAINER}>
      <span className="sr-only">טוען…</span>
      <Skeleton className="mb-5 h-4 w-32" />
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mb-6 mt-3 h-5 w-full max-w-md" />
      <SkeletonCard className="h-72" />
    </main>
  );
}
