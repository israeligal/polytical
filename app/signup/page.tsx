"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ballot } from "@/components/icons";
import { signUp } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
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
    // navigate ourselves on success, then refresh so the server-rendered header
    // (a layout Server Component) re-reads the new session + starting grant.
    const { error: err } = await signUp.email({ name, email, password });
    if (err) {
      setPending(false);
      setError(err.message ?? "ההרשמה נכשלה, נסו שוב");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Ballot className="h-6 w-6" />
          </span>
          <h1 className="font-display text-2xl font-black text-foreground">הרשמה לפוליטיקל</h1>
          <p className="text-sm text-muted-foreground">פתחו חשבון וקבלו 1,000 מטבעות התחלה</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-foreground">שם</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className="rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

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
              minLength={8}
              autoComplete="new-password"
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
            {pending ? "נרשם…" : "הרשמה"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          כבר יש לכם חשבון?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            התחברות
          </Link>
        </p>
      </div>
    </main>
  );
}
