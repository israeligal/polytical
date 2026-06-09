"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "@/components/icons";
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
 * ~590px), so they collapse in here behind a hamburger. Closes on navigation and
 * on click-away. Renders its own ThemeToggle/FaucetButton/SignOut instances — the
 * desktop copies are `display:none` at this width, so only one set is ever visible.
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

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        aria-label={open ? "סגירת התפריט" : "פתיחת התפריט"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-[12px] border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute end-0 top-full z-50 mt-2 w-60 rounded-card border border-border bg-card p-2 shadow-glow-mint">
            <nav className="flex flex-col">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={close}
                  className="rounded-[10px] px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-raised hover:text-primary"
                >
                  {n.label}
                </Link>
              ))}
              <Link
                href="/search"
                onClick={close}
                className="rounded-[10px] px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-raised hover:text-primary"
              >
                חיפוש
              </Link>
              {loggedIn && (
                <Link
                  href="/profile"
                  onClick={close}
                  className="rounded-[10px] px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-raised hover:text-primary"
                >
                  פרופיל
                </Link>
              )}
            </nav>

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
              <ThemeToggle initial={theme} />
              {loggedIn ? (
                <>
                  <FaucetButton />
                  <SignOutButton />
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={close}
                  className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  התחברות
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
