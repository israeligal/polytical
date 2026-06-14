"use client";

// The selectable בעד/נגד pill shared by StanceWidget (vote pages) and
// AgendaStanceWidget (pre-vote on upcoming bills). Presentational only — the
// parent owns the stance state + the cast handler; this just renders one pill.

export type Stance = "for" | "against";

export function StancePill({
  value,
  label,
  pressed,
  disabled,
  selectedClassName,
  onSelect,
}: {
  value: Stance;
  label: string;
  pressed: boolean;
  disabled: boolean;
  /** Classes for the selected state (filled), supplied by the parent per side. */
  selectedClassName: string;
  onSelect: (value: Stance) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      disabled={disabled}
      aria-pressed={pressed}
      className={`flex-1 rounded-full border-2 px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-60 ${
        pressed
          ? selectedClassName
          : value === "for"
            ? "border-positive bg-positive-soft text-positive hover:-translate-y-0.5"
            : "border-negative bg-negative-soft text-negative hover:-translate-y-0.5"
      }`}
    >
      {label}
    </button>
  );
}
