// Skeleton for the profile (stat cards + positions + history + suggestions).
export default function Loading() {
  return (
    <main
      role="status"
      aria-busy="true"
      aria-label="טוען פרופיל"
      className="mx-auto max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8"
    >
      <span className="sr-only">טוען…</span>
      <div className="mb-8 flex items-center gap-4">
        <div className="h-14 w-14 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-7 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-7 w-44 animate-pulse rounded bg-muted" />
        <div className="h-20 animate-pulse rounded-2xl border border-border bg-card" />
        <div className="h-20 animate-pulse rounded-2xl border border-border bg-card" />
      </div>
    </main>
  );
}
