"use client";
import { useState } from "react";
import { Sun, Moon } from "@/components/icons";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from "@/lib/theme";

/**
 * Light/dark toggle. The server (root layout) reads the theme cookie and sets
 * `data-theme` for a no-flash first paint; this only needs to flip the cookie +
 * the <html> attribute on click — CSS reacts instantly, no reload. `initial`
 * comes from the same server-read cookie so SSR and the client agree (no
 * hydration mismatch).
 */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  }

  const toDark = theme === "light";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={toDark ? "מצב כהה" : "מצב בהיר"}
      title={toDark ? "מצב כהה" : "מצב בהיר"}
      className="grid h-9 w-9 place-items-center rounded-[12px] border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      {toDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
  );
}
