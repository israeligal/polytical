import posthog from "posthog-js";

// PostHog — ERRORS ONLY, anonymous. We capture unhandled client-side exceptions
// to find and fix bugs. We do NOT track pageviews, clicks (autocapture), sessions,
// or identify users — no behavioral/usage analytics. No-op when the token isn't
// set (local/dev, or before the prod env var is configured).
const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
if (token) {
  posthog.init(token, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    capture_exceptions: true, // the one thing we want
    autocapture: false, // no click/button analytics
    capture_pageview: false, // no pageviews
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: "never", // anonymous — no person identification
    debug: process.env.NODE_ENV === "development",
  });
}
