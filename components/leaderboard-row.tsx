import type { LeaderboardEntry } from "@/lib/leaderboard";
import { formatCoins } from "@/lib/format";

export function LeaderboardRow({
  entry,
  you = false,
}: {
  entry: LeaderboardEntry;
  you?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${
        you ? "border-primary bg-primary/5" : "border-border bg-card"
      }`}
    >
      <span className="nums w-7 text-center text-lg font-black text-muted-foreground">
        {entry.rank}
      </span>
      <span className="grid h-9 w-9 place-items-center rounded-full bg-muted font-bold text-foreground ring-1 ring-border">
        {entry.handle[0]?.toUpperCase() ?? "?"}
      </span>
      <span className="flex-1 truncate font-semibold text-foreground">
        @{entry.handle}
        {you && <span className="text-muted-foreground"> · אתה</span>}
      </span>
      <span className="hidden text-sm text-muted-foreground sm:inline">
        דיוק <span className="nums font-bold text-foreground">{entry.accuracy}%</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-accent" />
        <span className="nums font-bold text-foreground">
          {formatCoins(entry.netWorth)}
        </span>
      </span>
    </div>
  );
}
