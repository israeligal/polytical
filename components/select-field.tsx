import type { SelectHTMLAttributes } from "react";

/**
 * Styled native <select>: the browser arrow is suppressed (it renders
 * misaligned at the field's bottom corner in RTL dark theme) and replaced
 * with a centered chevron at the logical end. Drop-in for the form FIELD
 * look — pass the same className the sibling inputs use.
 */
export function SelectField({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...props} className={`${className} appearance-none pe-9`}>
        {children}
      </select>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}
