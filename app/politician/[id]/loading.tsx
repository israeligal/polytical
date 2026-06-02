// Skeleton for the politician detail (sticky card column + facts/activity/markets).
export default function Loading() {
  return (
    <main
      role="status"
      aria-busy="true"
      aria-label="טוען פוליטיקאי"
      className="mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8"
    >
      <span className="sr-only">טוען…</span>
      <div className="mb-5 h-4 w-36 animate-pulse rounded bg-muted" />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="aspect-[3/4] w-full animate-pulse rounded-2xl border border-border bg-card" />
        </div>
        <div className="space-y-6">
          <div className="h-10 w-2/3 animate-pulse rounded bg-muted" />
          <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-card" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
            <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
          </div>
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="grid gap-4">
            <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
          </div>
        </div>
      </div>
    </main>
  );
}
