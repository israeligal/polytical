"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { leaveGroupAction } from "@/app/actions/groups";

/**
 * Member controls on the coalition management page: share the invite link (any
 * member can) and leave. The owner "leaving" hands off / archives server-side
 * (see leaveGroup). (The old "make this my home" toggle was removed with the
 * global-context redesign — the active-coalition cookie handles stickiness.)
 */
export function GroupActionBar({
  groupId,
  inviteCode,
}: {
  groupId: string;
  inviteCode: string;
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
        onClick={leave}
        disabled={pending}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-negative hover:text-negative disabled:opacity-60"
      >
        עזבו
      </button>
    </div>
  );
}
