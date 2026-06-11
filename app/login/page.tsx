"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ballot } from "@/components/icons";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { OrDivider } from "@/components/or-divider";
import { signIn } from "@/lib/auth-client";

/** Same-origin relative path only — anything else falls back to home. */
function safeCallbackUrl(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    // `callbackURL` only drives OAuth / email-verification redirects — the
    // email/password fetch sets the session cookie but does NOT navigate. So we
    // navigate ourselves on success (back to where the user came from — e.g.
    // the vote they were about to stance), then refresh so the server-rendered
    // header (a layout Server Component) re-reads the new session.
    const { error: err } = await signIn.email({ email, password });
    if (err) {
      setPending(false);
      setError(err.message ?? "ההתחברות נכשלה, בדקו את הפרטים");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Ballot className="h-6 w-6" />
          </span>
          <h1 className="font-display text-2xl font-black text-foreground">התחברות לפוליטיקל</h1>
          <p className="text-sm text-muted-foreground">שמחים שחזרתם — הזירה מחכה</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-foreground">אימייל</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              dir="ltr"
              className="rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-foreground">סיסמה</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              dir="ltr"
              className="rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          {error ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="mt-1 rounded-lg bg-primary px-4 py-2.5 font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? "מתחבר…" : "התחברות"}
          </button>

          <Link
            href="/forgot-password"
            className="text-center text-sm font-semibold text-primary hover:underline"
          >
            שכחתם סיסמה?
          </Link>
        </form>

        <OrDivider />

        <GoogleSignInButton label="התחברות עם Google" callbackUrl={callbackUrl} />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          אין לכם עדיין חשבון?{" "}
          <Link href="/signup" className="font-semibold text-primary hover:underline">
            הרשמה
          </Link>
        </p>
      </div>
    </main>
  );
}
