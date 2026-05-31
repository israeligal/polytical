import type { CatColor } from "@/lib/types";

// Literal class maps so Tailwind v4 statically detects every categorical utility.
// (A computed `bg-cat-${n}` would NOT be generated — these strings must appear verbatim.)

export const catBg: Record<CatColor, string> = {
  1: "bg-cat-1", 2: "bg-cat-2", 3: "bg-cat-3", 4: "bg-cat-4",
  5: "bg-cat-5", 6: "bg-cat-6", 7: "bg-cat-7", 8: "bg-cat-8",
};

export const catText: Record<CatColor, string> = {
  1: "text-cat-1", 2: "text-cat-2", 3: "text-cat-3", 4: "text-cat-4",
  5: "text-cat-5", 6: "text-cat-6", 7: "text-cat-7", 8: "text-cat-8",
};

export const catBorder: Record<CatColor, string> = {
  1: "border-cat-1", 2: "border-cat-2", 3: "border-cat-3", 4: "border-cat-4",
  5: "border-cat-5", 6: "border-cat-6", 7: "border-cat-7", 8: "border-cat-8",
};

export const catFrom: Record<CatColor, string> = {
  1: "from-cat-1", 2: "from-cat-2", 3: "from-cat-3", 4: "from-cat-4",
  5: "from-cat-5", 6: "from-cat-6", 7: "from-cat-7", 8: "from-cat-8",
};

export const catTint: Record<CatColor, string> = {
  1: "bg-cat-1/12", 2: "bg-cat-2/12", 3: "bg-cat-3/12", 4: "bg-cat-4/12",
  5: "bg-cat-5/12", 6: "bg-cat-6/12", 7: "bg-cat-7/12", 8: "bg-cat-8/12",
};
