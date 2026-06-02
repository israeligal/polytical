// Skeleton for the season board while the RSC streams.
export default function SeasonsLoading() {
  return (
    <main className="mx-auto max-w-2xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 h-44 animate-pulse rounded-card border border-border bg-card" />
      <div className="mb-3 h-6 w-40 animate-pulse rounded bg-card" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-card border border-border bg-card" />
        ))}
      </div>
    </main>
  );
}
