"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinGroupAction } from "@/app/actions/groups";

/** Join CTA on the invite-preview page. */
export function JoinGroupButton({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function join() {
    setMessage(null);
    startTransition(async () => {
      const res = await joinGroupAction({ inviteCode });
      if (res.ok && res.slug) {
        router.push(`/g/${res.slug}`);
        return;
      }
      setMessage(res.message ?? "שגיאה");
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={join}
        disabled={pending}
        className="rounded-lg bg-primary px-6 py-2.5 font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "מצטרפים…" : "הצטרפו לקואליציה"}
      </button>
      {message && <span role="status" className="text-sm font-semibold text-negative">{message}</span>}
    </div>
  );
}
