"use client";

import { useMemo, useState } from "react";
import type { Politician } from "@/lib/types";
import { CaricatureCard } from "@/components/caricature-card";

export type CollectionItem = { politician: Politician; owned: boolean };

type Filter = "all" | "owned" | "locked";

/**
 * The collection gallery. Cards are adapted server-side and passed in with an
 * `owned` flag; this island owns the name-filter + owned/locked toggle and the
 * progress count. Reuses CaricatureCard (search-before-creating) via its `owned`
 * prop — un-owned cards render dimmed/locked.
 */
export function CollectionGallery({ items }: { items: CollectionItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const ownedCount = useMemo(() => items.filter((i) => i.owned).length, [items]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return items.filter((i) => {
      if (filter === "owned" && !i.owned) return false;
      if (filter === "locked" && i.owned) return false;
      if (q && !i.politician.name.includes(q)) return false;
      return true;
    });
  }, [items, query, filter]);

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "הכול" },
    { key: "owned", label: "באוסף" },
    { key: "locked", label: "נעולים" },
  ];

  return (
    <div>
      {/* progress */}
      <div className="mb-5 flex items-center justify-between gap-3 rounded-card border border-border bg-card px-5 py-4">
        <div>
          <p className="font-accent text-xs font-bold text-muted-foreground">הושלם</p>
          <p className="font-display text-2xl text-foreground">
            <span className="nums text-accent">{ownedCount}</span>
            <span className="text-muted-foreground"> / {items.length}</span>
          </p>
        </div>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: items.length ? `${(ownedCount / items.length) * 100}%` : "0%" }}
          />
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              aria-pressed={filter === t.key}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                filter === t.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="max-w-xs flex-1">
          <label htmlFor="collection-filter" className="sr-only">
            חיפוש לפי שם
          </label>
          <input
            id="collection-filter"
            type="search"
            inputMode="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם…"
            className="w-full rounded-lg border-2 border-border bg-card px-4 py-2 text-base text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((i) => (
            <CaricatureCard key={i.politician.id} politician={i.politician} realData owned={i.owned} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-muted-foreground">
          {filter === "owned" ? "עדיין לא אספתם אף קלף." : "לא נמצאו קלפים."}
        </p>
      )}
    </div>
  );
}
