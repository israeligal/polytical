"use client";

import { usePushSubscription } from "@/hooks/use-push-subscription";

/**
 * Push-notifications setting for the profile page. Unlike the one-shot
 * `EnablePush` CTA on /notifications, this is a persistent, state-aware switch:
 * it reflects every status (subscribed / can-enable / browser-blocked /
 * unsupported) with an explanatory line, so a user always understands why push
 * is on, off, or unavailable. The toggle action originates from this control so
 * the permission prompt fires inside a user gesture.
 */
export function PushSettings() {
  const { status, busy, enable, disable } = usePushSubscription();

  const on = status === "subscribed";
  const actionable = status === "default" || status === "subscribed";

  const hint =
    status === "subscribed"
      ? "מקבלים התראה כשתחזית שניחשתם בה מוכרעת או מבוטלת, וכשניחשתם נכון."
      : status === "default"
        ? "הפעילו כדי לקבל התראה כשתחזית שניחשתם בה מוכרעת, מבוטלת או נסגרת בקרוב."
        : status === "denied"
          ? "ההתראות חסומות בדפדפן. אפשרו אותן בהגדרות האתר ונסו שוב."
          : "התראות דחיפה אינן זמינות במכשיר זה. התקינו את האפליקציה למסך הבית כדי לקבלן.";

  return (
    <section className="mb-10 rounded-card border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold text-foreground">🔔 התראות דחיפה</h2>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="התראות דחיפה"
          disabled={!actionable || busy}
          onClick={() => void (on ? disable() : enable())}
          className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            on ? "bg-primary shadow-glow-mint" : "bg-muted"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-card shadow transition-all ${
              on ? "start-6" : "start-1"
            }`}
          />
        </button>
      </div>
    </section>
  );
}
