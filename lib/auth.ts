import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { grantStartingStack } from "@/app/lib/ledger/service";
import { logger } from "@/app/lib/logger";

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
  user: {
    additionalFields: {
      isAdmin: { type: "boolean", defaultValue: false, input: false },
    },
  },

  // Grant the 1,000-coin starting stack at signup — deterministic, so a brand-new
  // user's profile/leaderboard never read balance 0 racing the lazy header grant.
  // Idempotent + non-fatal: getOrInitBalance stays a fallback for any ungranted user.
  databaseHooks: {
    user: {
      create: {
        after: async (user: { id: string }) => {
          try {
            await grantStartingStack({ userId: user.id });
          } catch (e) {
            logger.error("starting_grant_failed", { userId: user.id, err: String(e) });
          }
        },
      },
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
