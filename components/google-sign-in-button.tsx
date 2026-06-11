"use client";
import { useState } from "react";
import { Google } from "@/components/icons";
import { signIn } from "@/lib/auth-client";

type GoogleSignInButtonProps = {
  /** Hebrew label — defaults differ for login vs signup. */
  label?: string;
  /** Same-origin path to land on after OAuth (validated by the caller). */
  callbackUrl?: string;
};

/**
 * Google OAuth entry point, shared by /login and /signup. Better Auth redirects
 * the browser to Google, so on success this never returns — it only resets
 * `pending` and surfaces a message if the redirect itself fails to start. New
 * OAuth users land on "/" and the proxy gate funnels them into onboarding,
 * matching the email/password flow.
 */
export function GoogleSignInButton({ label = "המשך עם Google", callbackUrl = "/" }: GoogleSignInButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setPending(true);
    const { error: err } = await signIn.social({ provider: "google", callbackURL: callbackUrl });
    if (err) {
      setPending(false);
      setError(err.message ?? "ההתחברות עם Google נכשלה, נסו שוב");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
        className="flex items-center justify-center gap-2.5 rounded-lg border border-border bg-background px-4 py-2.5 font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
      >
        <Google className="h-5 w-5" />
        {pending ? "מתחבר…" : label}
      </button>
      {error ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
