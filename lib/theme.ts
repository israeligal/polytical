// Theme preference — light (default, Israeli white) or dark (trading floor).
// Persisted in a non-HttpOnly cookie so the toggle can set it client-side AND
// the root layout can read it server-side for a no-flash first paint.

export type Theme = "light" | "dark";

export const THEME_COOKIE = "theme";
export const THEMES: Theme[] = ["light", "dark"];
/** One year, in seconds. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
