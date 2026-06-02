import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

// Markets feed (/) and most pages are public. These require a session:
const PROTECTED_ROUTES = ["/profile", "/admin", "/notifications", "/collection", "/onboarding"];
const AUTH_ROUTES = ["/login", "/signup"];
const ONBOARDING_ROUTE = "/onboarding";

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Better Auth owns its own API routes.
  if (path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const isProtectedRoute = PROTECTED_ROUTES.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
  const isAuthRoute = AUTH_ROUTES.some((route) => path === route);

  // Read the session for every page so the onboarding gate can apply app-wide.
  // A transient auth/DB failure must NOT 500 the public feed (the proxy now runs
  // for it too) — degrade to anonymous so public routes still render; protected
  // routes then fall through to the login redirect below. The inferred type is
  // `Session | null`, so no cast is needed.
  const session = await auth.api
    .getSession({ headers: req.headers })
    .catch(() => null);
  const isLoggedIn = !!session?.user;
  const isOnboarded = !!session?.user?.onboardedAt;

  if (isProtectedRoute && !isLoggedIn) {
    const callbackUrl = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, req.nextUrl.origin),
    );
  }

  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  // Onboarding gate: a logged-in user who hasn't cleared the gate is funneled to
  // /onboarding from anywhere; once cleared, /onboarding reverse-bounces home.
  if (isLoggedIn) {
    if (!isOnboarded && path !== ONBOARDING_ROUTE) {
      // The cookie says not-onboarded — but it may be a stale 5-min cache (e.g.
      // onboarding finished on ANOTHER device, whose cookie this request can't
      // see). Confirm against the DB before trapping the user: without this, a
      // stale not-onboarded cookie ping-pongs with the /onboarding page's
      // authoritative DB redirect (/ → /onboarding → / → …) until the cache
      // expires. Only not-onboarded-cookie users hitting a non-onboarding path
      // pay this read — a tiny, transient population (new users sit on
      // /onboarding, which is excluded here).
      const fresh = await auth.api
        .getSession({ headers: req.headers, query: { disableCookieCache: true } })
        .catch(() => null);
      if (!fresh?.user?.onboardedAt) {
        return NextResponse.redirect(new URL(ONBOARDING_ROUTE, req.nextUrl.origin));
      }
      // else: actually onboarded — the cookie was stale; let them through.
    }
    if (isOnboarded && path === ONBOARDING_ROUTE) {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
