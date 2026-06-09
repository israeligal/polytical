"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ballot } from "@/components/icons";
import { resetPassword } from "@/lib/auth-client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("הקישור לא תקין או שפג תוקפו. בקשו קישור חדש.");
      return;
    }
    setError(null);
    setPending(true);
    const { error: err } = await resetPassword({ newPassword: password, token });
    setPending(false);
    if (err) {
      setError(err.message ?? "איפוס הסיסמה נכשל. ייתכן שהקישור פג תוקף.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Ballot className="h-6 w-6" />
        </span>
        <h1 className="font-display text-2xl font-black text-foreground">בחירת סיסמה חדשה</h1>
        <p className="text-sm text-muted-foreground">הזינו סיסמה חדשה לחשבון שלכם</p>
      </div>

      {done ? (
        <div className="flex flex-col gap-4">
          <p className="rounded-lg bg-primary/10 px-4 py-3 text-center text-sm font-medium text-foreground">
            הסיסמה עודכנה בהצלחה. אפשר להתחבר עכשיו.
          </p>
          <Link
            href="/login"
            className="rounded-lg bg-primary px-4 py-2.5 text-center font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            התחברות
          </Link>
        </div>
      ) : !token ? (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-center text-sm font-medium text-destructive">
          הקישור לא תקין או שפג תוקפו.{" "}
          <Link href="/forgot-password" className="font-semibold underline">
            בקשת קישור חדש
          </Link>
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-foreground">סיסמה חדשה</span>
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
            {pending ? "מעדכן…" : "עדכון הסיסמה"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
