"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Close, Menu, PolyticalLogo, Search } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { FaucetButton } from "@/components/faucet-button";
import { SignOutButton } from "@/components/auth-buttons";
import type { Theme } from "@/lib/theme";

interface NavItem {
  href: string;
  label: string;
}

/**
 * Phone-only (`md:hidden`) header menu. The desktop bar lays the nav + secondary
 * actions out inline; below `md` they don't fit (the authed action cluster needs
 * ~590px), so they collapse in here behind a hamburger.
 *
 * Renders as a full-width top sheet (not a corner dropdown): in RTL the content
 * reads from the side the thumb opened, tap rows clear the 44px target, and a
 * dimmed backdrop + Escape + body-scroll-lock make it read as a real menu.
 * Closes on navigation (each link's onClick), backdrop tap, X, and Escape.
 */
export function MobileMenu({
  nav,
  theme,
  loggedIn,
}: {
  nav: NavItem[];
  theme: Theme;
  loggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Close on navigation. The header (and this menu) persist across client
  // route changes, so a full-screen sheet + scroll-lock would otherwise stay
  // open over the next page. Reset during render when the path changes — the
  // canonical no-effect pattern (avoids the synchronous-setState-in-effect lint).
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState(pathname);
  if (pathname !== menuPath) {
    setMenuPath(pathname);
    if (open) setOpen(false);
  }

  // Lock body scroll + close on Escape while open. (Navigation closes via each
  // link's onClick, so no route-change effect — that would lint as a
  // synchronous setState in effect.)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="פתיחת התפריט"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="grid h-9 w-9 place-items-center rounded-[12px] border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="סגירת התפריט"
            onClick={close}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          />
          <div className="absolute inset-x-0 top-0 max-h-[90dvh] overflow-y-auto rounded-b-card border-b border-border bg-card shadow-3 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
              <Link href="/" className="flex items-center gap-2.5" onClick={close}>
                <PolyticalLogo className="h-8 w-8" />
                <span className="font-display text-2xl leading-none text-foreground">פוליטיקל</span>
              </Link>
              <button
                type="button"
                onClick={close}
                aria-label="סגירה"
                className="grid h-9 w-9 place-items-center rounded-[12px] border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
              >
                <Close className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-col py-1">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={close}
                  className="px-4 py-3 text-base font-semibold text-foreground transition-colors hover:bg-muted/60 hover:text-primary"
                >
                  {n.label}
                </Link>
              ))}
              <Link
                href="/search"
                onClick={close}
                className="flex items-center gap-2 px-4 py-3 text-base font-semibold text-foreground transition-colors hover:bg-muted/60 hover:text-primary"
              >
                <Search className="h-5 w-5 text-muted-foreground" />
                חיפוש
              </Link>
            </nav>

            <div className="flex flex-col gap-3 border-t border-line-soft px-4 py-4">
              {loggedIn ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <FaucetButton />
                    <ThemeToggle initial={theme} />
                  </div>
                  <Link
                    href="/profile"
                    onClick={close}
                    className="rounded-full border border-border px-4 py-2 text-center text-sm font-bold text-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    הפרופיל שלי
                  </Link>
                  <SignOutButton />
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href="/login"
                    onClick={close}
                    className="flex-1 rounded-full bg-primary px-4 py-2 text-center text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
                  >
                    התחברות
                  </Link>
                  <ThemeToggle initial={theme} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
