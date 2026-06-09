import type { NotificationType } from "@/app/lib/notifications/repo";

export interface PushPrefCategory {
  key: string;
  labelHe: string;
  descHe: string;
  types: NotificationType[];
}

/**
 * User-facing grouping of push notification types. Toggling a category mutes (or
 * unmutes) ALL of its underlying types. These gate **web-push only** — the in-app
 * notification log always records the event regardless of these preferences.
 * Shared by the settings UI and the server action so both agree on the mapping.
 */
export const PUSH_PREF_CATEGORIES: PushPrefCategory[] = [
  {
    key: "outcomes",
    labelHe: "תוצאות שווקים",
    descHe: "ניחוש נכון, הכרעה או ביטול של שוק שניחשתם בו",
    types: ["bet_won", "market_resolved", "market_voided"],
  },
  {
    key: "closing",
    labelHe: "שווקים שנסגרים",
    descHe: "תזכורת כששוק שניחשתם בו עומד להיסגר",
    types: ["market_closing_soon"],
  },
  {
    key: "suggestions",
    labelHe: "הצעות שוק",
    descHe: "אישור או דחייה של שוק שהצעתם",
    types: ["suggestion_approved", "suggestion_rejected"],
  },
];

export const PUSH_PREF_CATEGORY_KEYS: string[] = PUSH_PREF_CATEGORIES.map((c) => c.key);

export function typesForCategory(key: string): NotificationType[] {
  return PUSH_PREF_CATEGORIES.find((c) => c.key === key)?.types ?? [];
}

/** A category reads "on" iff none of its push types are in the muted set. */
export function isCategoryEnabled(muted: ReadonlySet<string>, category: PushPrefCategory): boolean {
  return category.types.every((t) => !muted.has(t));
}
