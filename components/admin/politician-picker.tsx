"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { PoliticianOption } from "@/lib/types";
import { searchPoliticiansAction } from "@/app/actions/admin-markets";

const FIELD =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

/**
 * Admin-console politician autocomplete: type a name, pick a hit, submit the
 * stable personId (never a typed Hebrew string — spelling variants belong to
 * the search layer only). Single-select: a chosen politician renders as a chip
 * with a clear button; clearing returns to the search input. Callers that want
 * "add many" keep `value` null and accumulate selections in their own state.
 */
export function PoliticianPicker({
  value,
  onChange,
  placeholder = "חיפוש לפי שם…",
}: {
  value: PoliticianOption | null;
  onChange: (next: PoliticianOption | null) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PoliticianOption[]>([]);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id: only the LATEST in-flight search may write results —
  // a slow stale response (or one racing a selection) must not reopen the list.
  const seq = useRef(0);

  // A timer armed by the last keystroke must not fire after unmount (e.g. the
  // admin switches the market kind and this row disappears mid-search). An
  // already-in-flight response is harmless — setState on an unmounted
  // component is a no-op.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function search(text: string) {
    setQ(text);
    if (timer.current) clearTimeout(timer.current);
    const requestId = ++seq.current;
    if (!text.trim()) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const hits = await searchPoliticiansAction({ q: text });
          if (seq.current === requestId) setResults(hits);
        } catch {
          if (seq.current === requestId) setResults([]);
        }
      });
    }, 250);
  }

  function select(option: PoliticianOption) {
    if (timer.current) clearTimeout(timer.current);
    seq.current++; // invalidate any in-flight search — no ghost dropdown after picking
    onChange(option);
    setQ("");
    setResults([]);
  }

  if (value) {
    return (
      <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-primary bg-sunken px-3 py-2 text-sm font-semibold text-foreground">
        <span className="truncate">
          {value.nameHe}
          {value.roleHe && <span className="ms-1 font-normal text-muted-foreground">· {value.roleHe}</span>}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`הסרת ${value.nameHe}`}
          className="text-muted-foreground transition-colors hover:text-negative"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => search(e.target.value)}
        // Enter inside the autocomplete picks the top hit — it must NOT submit
        // the surrounding create-market form mid-edit.
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (results[0]) select(results[0]);
        }}
        placeholder={placeholder}
        className={FIELD}
        aria-label={placeholder}
      />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-md">
          {results.map((p) => (
            <li key={p.personId}>
              <button
                type="button"
                onClick={() => select(p)}
                className="block w-full px-3 py-2 text-start text-sm text-foreground transition-colors hover:bg-sunken"
              >
                <span className="font-semibold">{p.nameHe}</span>
                {p.roleHe && <span className="ms-1.5 text-muted-foreground">{p.roleHe}</span>}
                <span className="ms-1.5 nums text-xs text-muted-foreground">#{p.personId}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
