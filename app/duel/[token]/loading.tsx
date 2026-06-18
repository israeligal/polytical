/** Themed placeholder for the duel arena while the market loads. */
export default function DuelLoading() {
  return (
    <div
      data-theme="dark"
      dir="rtl"
      className="relative flex min-h-screen w-full flex-col items-center justify-center gap-5 overflow-hidden bg-background px-4 py-10"
    >
      <div className="h-3 w-28 animate-pulse rounded-full bg-raised" />
      <div className="h-7 w-64 animate-pulse rounded-full bg-raised" />
      <div className="flex w-full max-w-md items-stretch justify-center gap-3">
        <div className="h-32 flex-1 animate-pulse rounded-card bg-card" />
        <div className="h-14 w-14 animate-pulse self-center rounded-full bg-raised" />
        <div className="h-32 flex-1 animate-pulse rounded-card bg-card" />
      </div>
      <div className="h-28 w-full max-w-md animate-pulse rounded-card bg-card" />
      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        <div className="h-28 animate-pulse rounded-card bg-card" />
        <div className="h-28 animate-pulse rounded-card bg-card" />
      </div>
    </div>
  );
}
