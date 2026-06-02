import type { ReactNode } from "react";

// The shared dashed "nothing here yet" box used across lists/sections. RSC-safe
// (no 'use client'); pass the Hebrew copy + any CTA <Link> as children.
export function EmptyState({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-border bg-muted/50 px-4 py-8 text-center text-muted-foreground${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </div>
  );
}
