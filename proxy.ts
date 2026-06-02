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
  // Cheap: anonymous requests short-circuit; logged-in reads hit the 5-min
  // cookie cache. completeOnboardingAction re-issues that cookie, so the gate
  // below never bounces a just-finished user against a stale onboardedAt.
  const session = await auth.api.getSession({ headers: req.headers });
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

  // Onboarding gate: a logged-in user who hasn't cleared the gate is funneled
  // to /onboarding from anywhere; once cleared, /onboarding reverse-bounces home.
  if (isLoggedIn) {
    if (!isOnboarded && path !== ONBOARDING_ROUTE) {
      return NextResponse.redirect(new URL(ONBOARDING_ROUTE, req.nextUrl.origin));
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
