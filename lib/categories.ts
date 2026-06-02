import type { Category } from "@/lib/types";

export const CATEGORIES: { key: Category; he: string }[] = [
  { key: "elections", he: "בחירות" },
  { key: "coalition", he: "קואליציה" },
  { key: "security", he: "ביטחון" },
  { key: "legislation", he: "חקיקה" },
  { key: "personnel", he: "מינויים" },
  { key: "scandals", he: "פרשות" },
];

// Accepts a raw string (DB columns store category as free text) and falls back
// to the key for an unknown value — so callers never need a type-erasure cast.
// The write path (suggestions/admin) still validates against the Category union.
export const categoryLabel = (key: string): string =>
  CATEGORIES.find((c) => c.key === key)?.he ?? key;
