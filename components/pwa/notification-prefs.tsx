"use client";

import { useState, useTransition } from "react";
import {
  PUSH_PREF_CATEGORIES,
  isCategoryEnabled,
  type PushPrefCategory,
} from "@/lib/notification-prefs";
import { setPushCategoryAction } from "@/app/actions/notification-prefs";

/**
 * Per-category push opt-outs for the profile page. Server state (the user's
 * `mutedPushTypes`) is passed in for first paint; each toggle optimistically
 * flips, calls the server action, then reconciles to the authoritative muted set
 * it returns (or reverts on failure). These gate web-push only — in-app notices
 * are always kept.
 */
export function NotificationPrefs({ mutedPushTypes }: { mutedPushTypes: string[] }) {
  const [muted, setMuted] = useState<Set<string>>(() => new Set(mutedPushTypes));
  const [pending, startTransition] = useTransition();

  function toggle(category: PushPrefCategory, enabled: boolean) {
    const prev = muted;
    const next = new Set(muted);
    for (const t of category.types) {
      if (enabled) next.delete(t);
      else next.add(t);
    }
    setMuted(next);
    startTransition(async () => {
      const res = await setPushCategoryAction({ category: category.key, enabled });
      if (res.ok && res.mutedPushTypes) setMuted(new Set(res.mutedPushTypes));
      else if (!res.ok) setMuted(prev);
    });
  }

  return (
    <section className="mb-10 rounded-card border border-border bg-card p-5">
      <h2 className="font-display text-xl font-bold text-foreground">אילו התראות לקבל?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        בחרו אילו סוגי התראות דחיפה יישלחו אליכם. ההתראות באפליקציה תמיד נשמרות.
      </p>
      <ul className="mt-4 space-y-4">
        {PUSH_PREF_CATEGORIES.map((c) => {
          const on = isCategoryEnabled(muted, c);
          return (
            <li key={c.key} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold text-foreground">{c.labelHe}</p>
                <p className="text-sm text-muted-foreground">{c.descHe}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={c.labelHe}
                disabled={pending}
                onClick={() => toggle(c, !on)}
                className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                  on ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-card shadow transition-all ${
                    on ? "start-6" : "start-1"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
