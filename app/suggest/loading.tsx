// Skeleton for the suggest form (loads the MK roster for the picker).
export default function Loading() {
  return (
    <main
      role="status"
      aria-busy="true"
      aria-label="טוען"
      className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 lg:px-8"
    >
      <span className="sr-only">טוען…</span>
      <div className="mb-2 h-4 w-20 animate-pulse rounded bg-muted" />
      <div className="mb-6 h-9 w-48 animate-pulse rounded bg-muted" />
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="h-11 w-32 animate-pulse rounded-lg bg-muted" />
      </div>
    </main>
  );
}
