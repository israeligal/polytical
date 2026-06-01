import { Coin } from "@/components/icons";
import { formatCoins } from "@/lib/format";

/** The play-money balance, in the gold "coin" accent. */
export function CoinPill({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-accent-foreground shadow-sm">
      <Coin className="h-4 w-4" />
      <span className="nums text-sm font-bold">{formatCoins(amount)}</span>
    </span>
  );
}
