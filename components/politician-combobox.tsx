"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Image from "next/image";
import type { PoliticianOption } from "@/lib/types";
import { Search } from "@/components/icons";

// Shared searchable combobox for politician selection. Used by both the admin
// market form (via PoliticianPicker) and the public suggestion form. The caller
// injects the search action so the two surfaces use their own auth boundary.

const FIELD =
  "w-full rounded-lg border border-border bg-card ps-9 pe-3 py-2 text-sm text-foreground outline-none focus:border-primary";

// Tiny circular portrait — caricature when available, else initials fallback.
function MiniPortrait({ option, size = 28 }: { option: PoliticianOption; size?: number }) {
  const initials = option.nameHe
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("");

  if (option.imageUrl) {
    return (
      <span
        className="relative inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-border"
        style={{ width: size, height: size }}
      >
        <Image
          src={option.imageUrl}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-sunken ring-1 ring-border text-[10px] font-bold text-muted-foreground"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

/**
 * Searchable politician combobox. The caller supplies a `search` callback (a
 * Server Action or any async function) so admin and public surfaces each use
 * their own auth boundary.  Full keyboard navigation: ArrowDown/Up move the
 * active row, Enter picks the highlighted row (without submitting the form),
 * Escape closes the dropdown. Proper ARIA combobox/listbox wiring.
 */
export function PoliticianCombobox({
  value,
  onChange,
  search,
  placeholder = "חיפוש לפי שם…",
  label,
  showPersonId = false,
}: {
  value: PoliticianOption | null;
  onChange: (next: PoliticianOption | null) => void;
  search: (args: { q: string }) => Promise<PoliticianOption[]>;
  placeholder?: string;
  label?: string;
  /** Admin verification affordance — the raw stable id stays off public surfaces. */
  showPersonId?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PoliticianOption[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [, startTransition] = useTransition();

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id: only the LATEST in-flight search may write results.
  const seq = useRef(0);
  const listboxId = useId();

  // Clear the timer on unmount — prevents a stale callback from firing after
  // the component (e.g. an outcome row) is removed.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function doSearch(text: string) {
    setQ(text);
    setActiveIdx(-1);
    if (timer.current) clearTimeout(timer.current);
    const requestId = ++seq.current;
    if (!text.trim()) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const hits = await search({ q: text });
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
    setActiveIdx(-1);
  }

  function close() {
    setResults([]);
    setActiveIdx(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault(); // never submit the surrounding form mid-edit
      const target = activeIdx >= 0 ? results[activeIdx] : results[0];
      if (target) select(target);
    }
  }

  const open = results.length > 0;
  const activeOptionId = activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined;

  if (value) {
    return (
      <span
        className="inline-flex max-w-full items-center gap-2 rounded-lg border border-primary bg-sunken px-2 py-1.5 text-sm font-semibold text-foreground"
        aria-label={label}
      >
        <MiniPortrait option={value} />
        <span className="truncate">
          {value.nameHe}
          {value.roleHe && <span className="ms-1 font-normal text-muted-foreground">· {value.roleHe}</span>}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`הסרת ${value.nameHe}`}
          className="ms-auto shrink-0 text-muted-foreground transition-colors hover:text-negative"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <div className="relative">
      {/* Search icon — logical start position */}
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted-foreground">
        <Search className="h-4 w-4" />
      </span>
      <input
        value={q}
        onChange={(e) => doSearch(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={FIELD}
        aria-label={label ?? placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
      />
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label ?? placeholder}
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-md"
        >
          {results.map((p, i) => {
            const isActive = i === activeIdx;
            return (
              <li
                key={p.personId}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={isActive}
              >
                <button
                  type="button"
                  onClick={() => select(p)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-foreground transition-colors ${
                    isActive ? "bg-sunken" : "hover:bg-sunken"
                  }`}
                >
                  <MiniPortrait option={p} />
                  <span className="font-semibold">{p.nameHe}</span>
                  {p.roleHe && <span className="text-muted-foreground">{p.roleHe}</span>}
                  {showPersonId && (
                    <span className="ms-auto nums text-xs text-muted-foreground">#{p.personId}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
