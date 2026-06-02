"use client";

import { useEffect } from "react";
import { logger } from "@/app/lib/logger";

// Route-segment error boundary (must be a Client Component). Catches throws from
// any RSC below the root layout (a Neon hiccup, a repo scope-guard throwing per
// "errors over fallbacks") and offers an on-brand Hebrew recovery instead of
// Next's default error screen.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("route.error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main
      role="alert"
      className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center px-4 py-24 text-center"
    >
      <h1 className="font-display text-4xl font-black text-foreground sm:text-5xl">
        משהו השתבש
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        לא הצלחנו לטעון את העמוד. נסו שוב, ואם זה חוזר — רעננו את הדף.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        נסו שוב
      </button>
    </main>
  );
}
