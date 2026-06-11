export default function Loading() {
  return (
    <main
      role="status"
      aria-busy="true"
      aria-label="טוען התאמה"
      className="mx-auto max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8"
    >
      <span className="sr-only">טוען…</span>
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-9 w-72 animate-pulse rounded bg-muted" />
      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="grid gap-2">
            {Array.from({ length: 3 }, (_, j) => (
              <div key={j} className="h-20 animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
