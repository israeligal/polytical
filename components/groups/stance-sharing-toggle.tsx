"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleGroupStanceSharingAction } from "@/app/actions/group-stances";

/**
 * Opt in/out of sharing YOUR Knesset-vote stances (בעד/נגד) with fellow members
 * of this group. Default OFF. Sharing reveals your direction only to other
 * members who are ALSO sharing; turning it off hides your past directions from
 * the group immediately. Nothing leaves the group.
 */
export function StanceSharingToggle({
  groupId,
  slug,
  initialShared,
}: {
  groupId: string;
  slug: string;
  initialShared: boolean;
}) {
  const router = useRouter();
  const [shared, setShared] = useState(initialShared);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !shared;
    setMessage(null);
    startTransition(async () => {
      const res = await toggleGroupStanceSharingAction({ groupId, slug, share: next });
      if (res.ok) {
        setShared(next);
        router.refresh();
      } else {
        setMessage(res.message ?? "שגיאה");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-foreground">שיתוף עמדות בקואליציה</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            כשתשתפו, חברי הקואליציה האחרים שגם משתפים יוכלו לראות איך הצבעתם (בעד/נגד) בהצבעות הכנסת.
            הכיבוי מסתיר מיד את העמדות שלכם מהקבוצה. שום דבר לא יוצא מהקואליציה.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={shared}
          className={`shrink-0 rounded-full border-2 px-4 py-1.5 text-sm font-bold transition-colors disabled:opacity-60 ${
            shared
              ? "border-primary bg-primary text-primary-foreground hover:bg-primary-hover"
              : "border-border text-muted-foreground hover:border-primary hover:text-primary"
          }`}
        >
          {pending ? "…" : shared ? "משתפים ✓" : "שתפו עמדות"}
        </button>
      </div>
      {message && <p role="status" className="mt-2 text-sm font-semibold text-negative">{message}</p>}
    </div>
  );
}
