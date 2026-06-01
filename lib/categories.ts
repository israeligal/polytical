import type { Category } from "@/lib/types";

export const CATEGORIES: { key: Category; he: string }[] = [
  { key: "elections", he: "בחירות" },
  { key: "coalition", he: "קואליציה" },
  { key: "security", he: "ביטחון" },
  { key: "legislation", he: "חקיקה" },
  { key: "personnel", he: "מינויים" },
  { key: "scandals", he: "פרשות" },
];

export const categoryLabel = (key: Category): string =>
  CATEGORIES.find((c) => c.key === key)?.he ?? key;
