"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Close, Menu, PolyticalLogo, Search } from "@/components/icons";
import { FaucetButton } from "@/components/faucet-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/auth-buttons";
import type { Theme } from "@/lib/theme";

type NavItem = { href: string; label: string };

/**
 * Mobile-only navigation drawer (hamburger → top sheet). The desktop header
 * keeps its inline nav + action cluster; on < md that cluster is too wide and
 * overflows the viewport, so here we collapse navigation + secondary actions
 * behind one button. Closes on navigation, backdrop tap, X, and Escape.
 */
export function MobileMenu({
  nav,
  isLoggedIn,
  theme,
}: {
  nav: ReadonlyArray<NavItem>;
  isLoggedIn: boolean;
  theme: Theme;
}) {
  const [open, setOpen] = useState(false);

  // Every drawer link closes the menu via its own onClick, so navigation
  // dismisses it without a route-change effect (which would lint as a
  // synchronous setState in effect).

  // Lock body scroll + close on Escape while open.
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="תפריט"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-[12px] border border-border bg-card text-muted-foreground transition-colors hover:text-foreground md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="סגירת התפריט"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          />
          <div className="absolute inset-x-0 top-0 max-h-[90dvh] overflow-y-auto rounded-b-card border-b border-border bg-card shadow-3 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
              <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
                <PolyticalLogo className="h-8 w-8" />
                <span className="font-display text-2xl leading-none text-foreground">פוליטיקל</span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
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
                  onClick={() => setOpen(false)}
                  className="px-4 py-3 text-base font-semibold text-foreground transition-colors hover:bg-muted/60 hover:text-primary"
                >
                  {n.label}
                </Link>
              ))}
              <Link
                href="/search"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-3 text-base font-semibold text-foreground transition-colors hover:bg-muted/60 hover:text-primary"
              >
                <Search className="h-5 w-5 text-muted-foreground" />
                חיפוש
              </Link>
            </nav>

            <div className="flex flex-col gap-3 border-t border-line-soft px-4 py-4">
              {isLoggedIn ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <FaucetButton />
                    <ThemeToggle initial={theme} />
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setOpen(false)}
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
                    onClick={() => setOpen(false)}
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
    </>
  );
}
