export default function Loading() {
  return (
    <main
      role="status"
      aria-busy="true"
      aria-label="טוען הצבעה"
      className="mx-auto max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8"
    >
      <span className="sr-only">טוען…</span>
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-5 h-8 w-3/4 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-4 w-48 animate-pulse rounded bg-muted" />
      <div className="mt-6 h-24 animate-pulse rounded-2xl border border-border bg-card" />
      <div className="mt-8 grid gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
    </main>
  );
}
