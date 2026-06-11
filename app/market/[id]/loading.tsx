// Skeleton for the market detail (two-column: content + sticky bet panel).
export default function Loading() {
  return (
    <main
      role="status"
      aria-busy="true"
      aria-label="טוען תחזית"
      className="mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8"
    >
      <span className="sr-only">טוען…</span>
      <div className="mb-5 h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="h-10 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-32 w-full animate-pulse rounded-2xl border border-border bg-card" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
            <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
          </div>
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-xl border border-border bg-card" />
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="h-72 w-full animate-pulse rounded-2xl border border-border bg-card" />
        </aside>
      </div>
    </main>
  );
}
