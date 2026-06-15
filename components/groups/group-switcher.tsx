"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { groupLabel } from "@/lib/group-display";

export interface SwitcherGroup {
  slug: string;
  nameHe: string;
  emblem: string | null;
}

/**
 * Header switcher between the national (ארצי) view and the viewer's groups.
 * A native <details> disclosure — no JS state, SSR-safe, RTL-fine. The current
 * group is derived from the path (/g/[slug]); anything else reads as "ארצי".
 */
export function GroupSwitcher({ groups }: { groups: SwitcherGroup[] }) {
  const pathname = usePathname();
  const activeSlug = pathname.startsWith("/g/") ? pathname.split("/")[2] : null;
  const active = groups.find((g) => g.slug === activeSlug) ?? null;

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-bold text-accent-foreground transition-colors hover:bg-accent-hover">
        <span className="max-w-32 truncate">{active ? groupLabel(active) : "ארצי"}</span>
        <span aria-hidden className="text-xs text-accent-foreground/70">▾</span>
      </summary>
      <div className="absolute start-0 z-40 mt-2 min-w-52 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <Link
          href="/?view=general"
          className={`block px-4 py-2.5 text-sm transition-colors hover:bg-muted ${active ? "text-foreground" : "font-bold text-primary"}`}
        >
          ארצי
        </Link>
        {groups.length > 0 && <div className="border-t border-line-soft" />}
        {groups.map((g) => (
          <Link
            key={g.slug}
            href={`/g/${g.slug}`}
            className={`block truncate px-4 py-2.5 text-sm transition-colors hover:bg-muted ${g.slug === activeSlug ? "font-bold text-primary" : "text-foreground"}`}
          >
            {groupLabel(g)}
          </Link>
        ))}
        <div className="border-t border-line-soft" />
        <Link href="/g" className="block px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-primary">
          + צרו או הצטרפו לקואליציה
        </Link>
      </div>
    </details>
  );
}
