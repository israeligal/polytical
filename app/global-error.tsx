"use client";

import "./globals.css";

// Last-resort boundary: catches a throw in the root layout / SiteHeader itself
// (which app/error.tsx cannot, since it lives BELOW the layout). It REPLACES the
// layout, so it must supply its own <html>/<body> and set RTL. Kept dependency-
// light because the app shell already failed.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center font-sans">
        <h1 className="font-display text-3xl font-black text-foreground">תקלה זמנית</h1>
        <p className="mt-2 text-muted-foreground">אירעה שגיאה כללית. רעננו את העמוד או נסו שוב.</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          נסו שוב
        </button>
      </body>
    </html>
  );
}
