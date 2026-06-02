// Skeleton for the season board while the RSC streams. Mirrors the real page's
// structure (back-link → banner with progress bar → tier track) so the swap to
// live content doesn't jump.
export default function SeasonsLoading() {
  return (
    <main className="mx-auto max-w-2xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      {/* back link */}
      <div className="mb-5 h-4 w-28 animate-pulse rounded bg-card" />

      {/* banner: trophy + title + countdown + progress bar */}
      <section className="mb-6 rounded-card border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
          <div className="flex-1">
            <div className="mb-2 h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="h-7 w-48 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="mt-4 h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="h-6 w-16 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
        </div>
      </section>

      {/* tier track */}
      <div className="mb-3 h-6 w-32 animate-pulse rounded bg-card" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-card border border-border bg-card p-4">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex-1">
              <div className="mb-2 h-5 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-52 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </main>
  );
}
