"use client";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";

/** Signs the user out, then hard-navigates home so server components re-render. */
export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    await signOut({ fetchOptions: { onSuccess: () => location.assign("/") } });
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-busy={pending}
      className="rounded-full border border-border px-3 py-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary disabled:opacity-60"
    >
      {pending ? "מתנתק…" : "התנתקות"}
    </button>
  );
}
