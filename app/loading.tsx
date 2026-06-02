// Instant skeleton for the homepage while its many DB reads resolve (markets +
// bundles + politicians + leaderboard). Pure presentational, no data.
export default function Loading() {
  return (
    <main className="flex-1" role="status" aria-busy="true" aria-label="טוען">
      <span className="sr-only">טוען…</span>

      {/* hero */}
      <section className="border-b border-border bg-muted">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-16">
          <div className="space-y-4">
            <div className="h-4 w-32 animate-pulse rounded bg-border" />
            <div className="h-10 w-3/4 animate-pulse rounded bg-border" />
            <div className="h-10 w-2/3 animate-pulse rounded bg-border" />
            <div className="h-20 w-full animate-pulse rounded bg-border" />
          </div>
          <div className="h-56 w-full animate-pulse rounded-2xl border border-border bg-card" />
        </div>
      </section>

      {/* markets */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      </section>

      {/* politicians band */}
      <section className="border-y border-border bg-muted">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="mb-6 h-8 w-56 animate-pulse rounded bg-border" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
