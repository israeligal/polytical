"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { setActiveCoalitionAction } from "@/app/actions/coalition";
import { groupLabel } from "@/lib/group-display";

export interface SwitcherGroup {
  id: string;
  slug: string;
  nameHe: string;
  emblem: string | null;
}

/**
 * Header switcher between the national (ארצי) view and the viewer's coalitions.
 * Selecting an item is NOT navigation — it sets the active-coalition context
 * (a cookie, via {@link setActiveCoalitionAction}) and `router.refresh()`es so
 * the current page's feed re-scopes in place. The active item is derived from
 * the `activeId` prop (server-resolved), never from the URL path.
 */
export function GroupSwitcher({
  groups,
  activeId,
}: {
  groups: SwitcherGroup[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const active = groups.find((g) => g.id === activeId) ?? null;

  function select(groupId: string | null) {
    if (groupId === activeId) {
      if (detailsRef.current) detailsRef.current.open = false;
      return;
    }
    if (detailsRef.current) detailsRef.current.open = false;
    startTransition(async () => {
      await setActiveCoalitionAction({ groupId });
      router.refresh();
    });
  }

  return (
    <details ref={detailsRef} className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-bold text-accent-foreground transition-colors hover:bg-accent-hover aria-disabled:opacity-70">
        <span className="max-w-32 truncate">{active ? groupLabel(active) : "ארצי"}</span>
        <span aria-hidden className="text-xs text-accent-foreground/70">▾</span>
      </summary>
      <div className="absolute start-0 z-40 mt-2 min-w-52 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <button
          type="button"
          onClick={() => select(null)}
          disabled={pending}
          className={`block w-full px-4 py-2.5 text-start text-sm transition-colors hover:bg-muted disabled:opacity-60 ${active ? "text-foreground" : "font-bold text-primary"}`}
        >
          ארצי
        </button>
        {groups.length > 0 && <div className="border-t border-line-soft" />}
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => select(g.id)}
            disabled={pending}
            className={`block w-full truncate px-4 py-2.5 text-start text-sm transition-colors hover:bg-muted disabled:opacity-60 ${g.id === activeId ? "font-bold text-primary" : "text-foreground"}`}
          >
            {groupLabel(g)}
          </button>
        ))}
        <div className="border-t border-line-soft" />
        <Link href="/g" className="block px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-primary">
          + צרו או הצטרפו לקואליציה
        </Link>
      </div>
    </details>
  );
}
