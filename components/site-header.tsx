import Link from "next/link";
import { cookies } from "next/headers";
import { Ballot, PolyticalLogo, Search } from "@/components/icons";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/auth-buttons";
import { MobileMenu } from "@/components/mobile-menu";
import { getSession } from "@/lib/auth";
import { THEME_COOKIE, resolveTheme, type Theme } from "@/lib/theme";
import { getUnreadCount } from "@/app/lib/notifications/service";

// האוסף + עונה are personal progress — they live on /profile now, not the nav.
const NAV = [
  { href: "/#markets", label: "תחזיות" },
  { href: "/votes", label: "הצבעות" },
  { href: "/#politicians", label: "פוליטיקאים" },
  { href: "/#leaderboard", label: "טבלת מובילים" },
];

export async function SiteHeader() {
  const session = await getSession();
  const user = session?.user ?? null;
  const unread = user ? await getUnreadCount({ userId: user.id }) : 0;
  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? "?";
  const theme: Theme = resolveTheme({ cookieValue: (await cookies()).get(THEME_COOKIE)?.value });

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
          {/* The community CTA — gold accent so it reads as "do something", not another nav link. */}
          <Link
            href="/suggest"
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 px-3.5 py-1.5 text-sm font-bold text-gold transition-colors hover:border-accent hover:bg-accent/20"
          >
            <Ballot className="h-4 w-4" />
            הצעה לסדר
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {/* Desktop (md+): the full inline action cluster. */}
          <div className="hidden items-center gap-3 md:flex">
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
                <NotificationBell unreadCount={unread} />
                <Link
                  href="/profile"
                  className="text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
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

          {/* Mobile (<md): the bell stays one tap away; everything else folds into the menu. */}
          <div className="flex items-center gap-2 md:hidden">
            {user && <NotificationBell unreadCount={unread} />}
            <MobileMenu nav={NAV} theme={theme} loggedIn={!!user} />
          </div>
        </div>
      </div>
    </header>
  );
}
