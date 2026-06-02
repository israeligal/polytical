import Link from "next/link";
import { cookies } from "next/headers";
import { PolyticalLogo, Search } from "@/components/icons";
import { CoinPill } from "@/components/coin-pill";
import { FaucetButton } from "@/components/faucet-button";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/auth-buttons";
import { getSession } from "@/lib/auth";
import { THEME_COOKIE, type Theme } from "@/lib/theme";
import { getOrInitBalance } from "@/app/lib/ledger/service";
import { getUnreadCount } from "@/app/lib/notifications/service";

const NAV = [
  { href: "/#markets", label: "שווקים" },
  { href: "/#politicians", label: "פוליטיקאים" },
  { href: "/collection", label: "האוסף" },
  { href: "/seasons", label: "עונה" },
  { href: "/#leaderboard", label: "טבלת מובילים" },
  { href: "/suggest", label: "הציעו שוק" },
];

export async function SiteHeader() {
  const session = await getSession();
  const user = session?.user ?? null;
  const balance = user ? await getOrInitBalance({ userId: user.id }) : 0;
  const unread = user ? await getUnreadCount({ userId: user.id }) : 0;
  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? "?";
  const theme: Theme = (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";

  return (
    <header
      className="sticky top-0 z-30 border-b border-line-soft backdrop-blur-xl"
      style={{ backgroundColor: "var(--header-bg)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <PolyticalLogo className="h-8 w-8" />
          <span className="font-display text-2xl leading-none text-foreground">פוליטיקל</span>
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
          <Link
            href="/search"
            aria-label="חיפוש"
            className="grid h-9 w-9 place-items-center rounded-[12px] border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <Search className="h-5 w-5" />
          </Link>
          <ThemeToggle initial={theme} />
          {user ? (
            <>
              <FaucetButton />
              <CoinPill amount={balance} />
              <NotificationBell unreadCount={unread} />
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
