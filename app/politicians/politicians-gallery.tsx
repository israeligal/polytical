"use client";

import { useMemo, useState } from "react";
import type { Politician } from "@/lib/types";
import { CaricatureCard } from "@/components/caricature-card";
import { POLITICIANS_GRID } from "@/components/skeletons/containers";

/**
 * Client-side gallery for all current MKs. Cards are adapted server-side and
 * passed in; this component only owns the Hebrew name-filter box. Markets are
 * mock-only, so every card renders with `realData` (no mock market lookup).
 */
export function PoliticiansGallery({ politicians }: { politicians: Politician[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return politicians;
    return politicians.filter((p) => p.name.includes(q));
  }, [politicians, query]);

  return (
    <div>
      <div className="mb-6 max-w-md">
        <label htmlFor="mk-filter" className="sr-only">
          חיפוש לפי שם
        </label>
        <input
          id="mk-filter"
          type="search"
          inputMode="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש פוליטיקאי לפי שם…"
          className="w-full rounded-lg border-2 border-border bg-card px-4 py-2.5 text-base text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      {filtered.length > 0 ? (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            <span className="nums font-bold text-foreground">{filtered.length}</span> פוליטיקאים
          </p>
          <div className={POLITICIANS_GRID}>
            {filtered.map((p) => (
              <CaricatureCard key={p.id} politician={p} realData />
            ))}
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-10 text-center text-muted-foreground">
          לא נמצאו פוליטיקאים בשם הזה.
        </p>
      )}
    </div>
  );
}
