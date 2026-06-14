"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHomeGroupAction, leaveGroupAction } from "@/app/actions/groups";

/**
 * Member controls on the group page: share the invite link (any member can),
 * toggle the group as your home landing, and leave. The owner "leaving" hands
 * off / archives server-side (see leaveGroup).
 */
export function GroupActionBar({
  groupId,
  inviteCode,
  isHome,
}: {
  groupId: string;
  inviteCode: string;
  isHome: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function copyInvite() {
    const url = `${window.location.origin}/g/join/${inviteCode}`;
    void navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false),
    );
  }

  function toggleHome() {
    startTransition(async () => {
      await setHomeGroupAction({ groupId: isHome ? null : groupId });
      router.refresh();
    });
  }

  function leave() {
    startTransition(async () => {
      const res = await leaveGroupAction({ groupId });
      if (res.ok) router.push("/g");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copyInvite}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary"
      >
        {copied ? "הקישור הועתק ✓" : "🔗 העתיקו קישור הזמנה"}
      </button>
      <button
        type="button"
        onClick={toggleHome}
        disabled={pending}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary disabled:opacity-60"
      >
        {isHome ? "🏠 הקואליציה היא הבית שלי" : "הפכו לבית שלי"}
      </button>
      <button
        type="button"
        onClick={leave}
        disabled={pending}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-negative hover:text-negative disabled:opacity-60"
      >
        עזבו
      </button>
    </div>
  );
}
