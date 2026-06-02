import { Shekoin } from "@/components/icons";
import { formatCoins } from "@/lib/format";

/** Shekoin balance — gold-tinted pill with the coin glyph + tabular gold amount. */
export function CoinPill({ amount }: { amount: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
      style={{ backgroundColor: "rgba(255,194,61,.12)", border: "1px solid rgba(255,194,61,.3)" }}
    >
      <Shekoin className="h-[18px] w-[18px]" />
      <span className="nums text-sm font-extrabold text-gold">{formatCoins(amount)}</span>
    </span>
  );
}
