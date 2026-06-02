import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

// Markets feed (/) and most pages are public. These require a session:
const PROTECTED_ROUTES = ["/profile", "/admin", "/notifications"];
const AUTH_ROUTES = ["/login", "/signup"];

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

  if (!isProtectedRoute && !isAuthRoute) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({ headers: req.headers });
  const isLoggedIn = !!session?.user;

  if (isProtectedRoute && !isLoggedIn) {
    const callbackUrl = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, req.nextUrl.origin),
    );
  }

  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
