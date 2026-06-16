"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setActiveCoalitionAction } from "@/app/actions/coalition";

/**
 * Slim banner above the feed when a coalition is the active context. Makes the
 * scope unmistakable ("you're viewing X") and offers a one-tap way out to ארצי
 * (national) plus a link to the coalition's management page. The "back to ארצי"
 * control reuses the same context action as the header switcher.
 */
export function CoalitionScopeBanner({ label, slug }: { label: string; slug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function backToNational() {
    startTransition(async () => {
      await setActiveCoalitionAction({ groupId: null });
      router.refresh();
    });
  }

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
      <p className="text-sm text-foreground">
        הזירה של <span className="font-bold">{label}</span> — תנו מנדט, טפסו ללוח
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={`/g/${slug}`}
          className="rounded-full px-3 py-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          ניהול
        </Link>
        <button
          type="button"
          onClick={backToNational}
          disabled={pending}
          className="rounded-full bg-card px-3 py-1 text-sm font-bold text-primary ring-1 ring-border transition-colors hover:ring-primary disabled:opacity-60"
        >
          חזרה לארצי
        </button>
      </div>
    </div>
  );
}
