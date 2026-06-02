// Skeleton while a search query streams.
export default function SearchLoading() {
  return (
    <main className="mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <div className="mb-4 h-9 w-44 animate-pulse rounded bg-card" />
        <div className="h-14 animate-pulse rounded-card border border-border bg-card" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-card border border-border bg-card" />
        ))}
      </div>
    </main>
  );
}
