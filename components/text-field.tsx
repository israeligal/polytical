"use client";

// One text input, several looks. Lets the wizard swap input chrome (and mix
// per-field — e.g. an elevated hero question over underline secondary fields)
// without each call site re-implementing focus state, motion, or maxLength.
// All RTL, tokens-only, reduced-motion aware.

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Sparkle } from "@/components/icons";

export type InputVariant = "default" | "underline" | "elevated" | "soft" | "bold";

export interface TextFieldProps {
  value: string;
  onChange: (next: string) => void;
  variant?: InputVariant;
  placeholder?: string;
  ariaLabel?: string;
  maxLength?: number;
  autoFocus?: boolean;
  /** Show the leading ✦ on the elevated variant (off for narrow rows). */
  withIcon?: boolean;
  /** Wrapper layout classes (e.g. `min-w-40 flex-1` inside a flex row). */
  className?: string;
  id?: string;
}

const SHARED = "w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/55";

export function TextField({
  value,
  onChange,
  variant = "default",
  placeholder,
  ariaLabel,
  maxLength,
  autoFocus,
  withIcon = true,
  className = "",
  id,
}: TextFieldProps) {
  const reduce = useReducedMotion();
  const [focused, setFocused] = useState(false);

  const handle = (raw: string) => onChange(maxLength ? raw.slice(0, maxLength) : raw);
  const common = {
    id,
    value,
    autoFocus,
    placeholder,
    "aria-label": ariaLabel,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => handle(e.target.value),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };

  if (variant === "underline") {
    return (
      <div className={`relative ${className}`}>
        <input
          {...common}
          className={`${SHARED} border-0 border-b border-border px-0 py-2`}
        />
        <motion.span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 origin-center rounded-full bg-primary"
          initial={false}
          animate={{ scaleX: focused ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
        />
      </div>
    );
  }

  if (variant === "elevated") {
    return (
      <div className={className}>
        <div
          className={`flex items-center gap-2.5 rounded-xl border bg-card ps-3 pe-3 py-2.5 transition-all duration-200 ${
            focused ? "-translate-y-0.5 border-primary shadow-md" : "border-border shadow-sm"
          }`}
        >
          {withIcon && (
            <Sparkle className={`h-5 w-5 shrink-0 transition-colors ${focused ? "text-primary" : "text-muted-foreground/70"}`} />
          )}
          <input {...common} className={SHARED} />
        </div>
      </div>
    );
  }

  if (variant === "soft") {
    return (
      <input
        {...common}
        className={`${SHARED} rounded-xl border border-transparent bg-sunken px-4 py-3 transition-shadow focus:border-primary focus:ring-4 focus:ring-primary/15 ${className}`}
      />
    );
  }

  if (variant === "bold") {
    return (
      <input
        {...common}
        className={`w-full rounded-2xl border-2 border-border bg-card px-4 py-3.5 text-lg font-bold text-foreground outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground/45 focus:border-primary ${className}`}
      />
    );
  }

  // default — the original wizard field look
  return (
    <input
      {...common}
      className={`w-full rounded-lg border border-border bg-card px-3 py-2 text-base text-foreground outline-none transition-colors focus:border-primary placeholder:text-muted-foreground/55 ${className}`}
    />
  );
}
