// Skeleton for the full MK gallery (the largest list — ~120 cards).
export default function Loading() {
  return (
    <main
      role="status"
      aria-busy="true"
      aria-label="טוען פוליטיקאים"
      className="mx-auto max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8"
    >
      <span className="sr-only">טוען…</span>
      <div className="mb-2 h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="mb-6 h-9 w-64 animate-pulse rounded bg-muted" />
      <div className="mb-6 h-11 w-full max-w-md animate-pulse rounded-lg border border-border bg-card" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
    </main>
  );
}
