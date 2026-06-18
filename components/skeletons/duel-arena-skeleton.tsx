import { DUEL_ARENA_SHELL } from "@/components/skeletons/containers";

/** Themed placeholder for the duel arena while the persisted challenge + market
 *  load. Shares the arena's shell classes via DUEL_ARENA_SHELL so it can't drift. */
export function DuelArenaSkeleton() {
  return (
    <div data-theme="dark" dir="rtl" className={`${DUEL_ARENA_SHELL} gap-5`}>
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
