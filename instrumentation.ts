import type { Instrumentation } from "next";

// Anonymous server-side error capture (Server Components / Route Handlers / Server
// Actions). Errors only — no user identity, no other events. Mirrors the client's
// errors-only PostHog setup. No-op without a token.
export const onRequestError: Instrumentation.onRequestError = async (err) => {
  // posthog-node is Node-only; the proxy (and any edge route) runs on the edge
  // runtime where it can't load. Dynamic-import behind a runtime guard so it never
  // bundles into / breaks the edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getPostHogClient } = await import("@/app/lib/posthog-server");
  const posthog = getPostHogClient();
  if (!posthog) return;
  await posthog.captureExceptionImmediate(err);
};
