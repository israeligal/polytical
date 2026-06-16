"use client";

// Category picker as a row of selectable chips instead of a <select>. With only
// a handful of categories this beats a dropdown on every axis the form cares
// about: nothing to open (no popover to clip or mis-position), big tap targets
// on mobile, and a mint pill that slides between chips via a shared layoutId.
// Keyboard: arrows roam the group, Enter/Space picks (native <button>).

import { motion, useReducedMotion } from "motion/react";

export interface CategoryChipsProps {
  categories: { key: string; he: string }[];
  value: string;
  onChange: (key: string) => void;
}

export function CategoryChips({ categories, value, onChange }: CategoryChipsProps) {
  const reduce = useReducedMotion();

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = categories.length - 1;
    let next = -1;
    // RTL: ArrowLeft advances, ArrowRight goes back; Up/Down stay intuitive.
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next < 0) return;
    e.preventDefault();
    const target = categories[next];
    if (!target) return;
    onChange(target.key);
    // Roving tabindex: focus follows selection to the newly-checked chip.
    const sibling = e.currentTarget.parentElement?.children[next];
    if (sibling instanceof HTMLElement) sibling.focus();
  }

  return (
    <div role="radiogroup" aria-label="קטגוריה" className="flex flex-wrap gap-2">
      {categories.map((c, i) => {
        const active = c.key === value;
        return (
          <motion.button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (!categories.some((x) => x.key === value) && i === 0) ? 0 : -1}
            onClick={() => onChange(c.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            whileTap={reduce ? undefined : { scale: 0.95 }}
            className={`relative isolate rounded-full border px-4 py-2.5 text-base font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:text-sm ${
              active
                ? "border-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
            }`}
          >
            {active && (
              <motion.span
                layoutId="category-chip-active"
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-full bg-primary"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38 }}
              />
            )}
            {c.he}
          </motion.button>
        );
      })}
    </div>
  );
}
