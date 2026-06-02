import Link from "next/link";
import type { Category } from "@/lib/types";
import { CATEGORIES } from "@/lib/categories";

const base =
  "inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 py-1.5 font-accent text-[13.5px] font-bold transition-colors";
const on = "border-primary bg-primary text-primary-foreground";
const off = "border-border bg-card text-muted-foreground hover:text-foreground";

/** Server-side category filter via ?cat= (no client JS). */
export function CategoryRail({ active }: { active?: Category }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <Link href="/#markets" className={`${base} ${!active ? on : off}`}>
        הכול
      </Link>
      {CATEGORIES.map((c) => (
        <Link
          key={c.key}
          href={`/?cat=${c.key}#markets`}
          className={`${base} ${active === c.key ? on : off}`}
        >
          {c.he}
        </Link>
      ))}
    </div>
  );
}
