export default function Loading() {
  return (
    <main
      role="status"
      aria-busy="true"
      aria-label="טוען הצבעות"
      className="mx-auto max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8"
    >
      <span className="sr-only">טוען…</span>
      <div className="h-4 w-28 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-9 w-64 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
      <div className="mt-8 grid gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
    </main>
  );
}
