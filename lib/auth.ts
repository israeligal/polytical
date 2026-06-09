import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";

// Enable Google only when credentials are present so local/dev boots without them.
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const socialProviders =
  googleClientId && googleClientSecret
    ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
    : {};

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  socialProviders,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // TODO(foundation): wire sendResetPassword once transactional email lands.
  },

  // `isAdmin` lives on the user table and gates admin routes (PRD P0).
  // handle/arena/onboardedAt drive the onboarding gate — they MUST be declared
  // here or they won't surface on session.user and proxy.ts can't read them.
  // input:false → set only via our server services, never client-writable.
  user: {
    additionalFields: {
      isAdmin: { type: "boolean", defaultValue: false, input: false },
      handle: { type: "string", required: false, input: false },
      arena: { type: "string", required: false, input: false },
      onboardedAt: { type: "date", required: false, input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once per day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },

  // Brute-force protection on auth endpoints (in-memory store; fine single-server).
  rateLimit: {
    window: 120,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 120, max: 10 },
      "/sign-up/email": { window: 120, max: 10 },
    },
  },

  trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [],

  plugins: [nextCookies()],

  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
});

export type Session = typeof auth.$Infer.Session;

/** Read the current session server-side (RSCs, route handlers, server actions). */
export async function getSession() {
  const { headers } = await import("next/headers");
  return auth.api.getSession({ headers: await headers() });
}

/** Force a DB-backed session read, re-issuing the (5-min) cookie cache. Call
 *  after a server-side write to user fields the proxy/header gate on — e.g.
 *  onboardedAt — so the refreshed cookie reflects it immediately and the
 *  onboarding gate doesn't bounce a just-finished user against a stale cookie. */
export async function refreshSession() {
  const { headers } = await import("next/headers");
  return auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
}
