import Link from "next/link";
import { Ballot } from "@/components/icons";
import { CoinPill } from "@/components/coin-pill";
import { FaucetButton } from "@/components/faucet-button";
import { SignOutButton } from "@/components/auth-buttons";
import { getSession } from "@/lib/auth";
import { getOrInitBalance } from "@/app/lib/ledger/service";

const NAV = [
  { href: "/#markets", label: "שווקים" },
  { href: "/#politicians", label: "פוליטיקאים" },
  { href: "/#leaderboard", label: "טבלת מובילים" },
  { href: "/suggest", label: "הציעו שוק" },
];

export async function SiteHeader() {
  const session = await getSession();
  const user = session?.user ?? null;
  const balance = user ? await getOrInitBalance({ userId: user.id }) : 0;
  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      {/* masthead kicker */}
      <div className="bg-foreground text-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-1 text-xs sm:px-6 lg:px-8">
          <span>מהדורת הבוקר · בלי כסף אמיתי, רק על הכבוד</span>
          <span className="hidden opacity-90 sm:inline">פוליטיקל · Polytical</span>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Ballot className="h-5 w-5" />
          </span>
          <span className="font-display text-2xl font-black leading-none text-foreground">
            פוליטיקל
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="inline-flex items-center py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <FaucetButton />
              <CoinPill amount={balance} />
              <Link
                href="/profile"
                className="hidden text-sm font-semibold text-muted-foreground transition-colors hover:text-primary sm:inline"
              >
                פרופיל
              </Link>
              <Link
                href="/profile"
                aria-label="פרופיל"
                className="grid h-9 w-9 place-items-center rounded-full bg-muted font-bold text-foreground ring-1 ring-border transition-colors hover:ring-primary"
              >
                <span aria-hidden="true">{initial}</span>
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              התחברות
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
