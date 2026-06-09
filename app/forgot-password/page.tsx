"use client";
import { useState } from "react";
import Link from "next/link";
import { Ballot } from "@/components/icons";
import { requestPasswordReset } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    // Better Auth simulates the lookup for unknown emails (no account
    // enumeration), so we always show the same neutral confirmation on success.
    const { error: err } = await requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    if (err) {
      setError(err.message ?? "שליחת הקישור נכשלה, נסו שוב");
      return;
    }
    setSent(true);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Ballot className="h-6 w-6" />
          </span>
          <h1 className="font-display text-2xl font-black text-foreground">איפוס סיסמה</h1>
          <p className="text-sm text-muted-foreground">נשלח אליכם קישור לבחירת סיסמה חדשה</p>
        </div>

        {sent ? (
          <p className="rounded-lg bg-primary/10 px-4 py-3 text-center text-sm font-medium text-foreground">
            אם הכתובת רשומה אצלנו, שלחנו אליה קישור לאיפוס הסיסמה. בדקו את תיבת הדואר.
          </p>
        ) : (
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
              {pending ? "שולח…" : "שליחת קישור"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-semibold text-primary hover:underline">
            חזרה להתחברות
          </Link>
        </p>
      </div>
    </main>
  );
}
