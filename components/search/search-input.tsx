"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Search } from "@/components/icons";

/**
 * The search box on /search. Uncontrolled (defaultValue from the page's
 * already-awaited searchParams) — so it needs no useState/useEffect sync and no
 * Suspense boundary, and re-renders from a debounced router.replace never reset
 * the caret mid-type. The URL stays the source of truth (shareable, back-friendly).
 */
export function SearchInput({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(next: string) {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const q = next.trim();
      router.replace(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    }, 300);
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-0 grid w-12 place-items-center text-muted-foreground">
        <Search className="h-5 w-5" />
      </span>
      <input
        type="search"
        inputMode="search"
        autoComplete="off"
        autoFocus
        defaultValue={initialQuery}
        onChange={(e) => onChange(e.target.value)}
        placeholder="חיפוש שווקים ופוליטיקאים…"
        className="w-full rounded-card border-2 border-border bg-card py-3 ps-12 pe-4 text-lg text-foreground shadow-3 transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
    </div>
  );
}
