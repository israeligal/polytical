import { PostHog } from "posthog-node";

// Anonymous server-side PostHog client, used ONLY for error capture (see
// instrumentation.ts onRequestError). No user identity, no product events.
let client: PostHog | null = null;
let resolved = false;

/** Returns the PostHog client, or null when no token is configured (local/dev, or
 *  before the prod env var is set) so callers no-op cleanly. */
export function getPostHogClient(): PostHog | null {
  if (resolved) return client;
  resolved = true;
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) return client;
  client = new PostHog(token, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}
