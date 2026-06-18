"use client";

// The wizard's plaintext input: a clean baseline that springs to a mint
// underline on focus. RTL, tokens-only, reduced-motion aware. Encapsulates the
// per-field focus state + motion so each call site stays a one-liner, and
// centralizes maxLength trimming.

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";

export interface TextFieldProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  maxLength?: number;
  autoFocus?: boolean;
  /** Wrapper layout classes (e.g. `min-w-40 flex-1` inside a flex row). */
  className?: string;
  id?: string;
}

export function TextField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  maxLength,
  autoFocus,
  className = "",
  id,
}: TextFieldProps) {
  const reduce = useReducedMotion();
  const [focused, setFocused] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full border-0 border-b border-border bg-transparent px-0 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground/55"
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
