import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { upsertSubscription, deleteByUserAndEndpoint } from "@/app/lib/push/repo";
import { logger } from "@/app/lib/logger";

// Push-subscription endpoint. POST registers/rebinds a browser's web-push
// subscription for the signed-in user; DELETE removes one (user-initiated
// unsubscribe). Auth-gated, rate-limited, and hand-rolls its own validation
// (no inline Zod). The HTTP contract is intentionally thin — repos own the DB.

export const runtime = "nodejs";

/** Narrows an unknown value to a non-empty string. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = checkRateLimit({ key: `push-sub:${userId}`, max: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "גוף הבקשה אינו תקין" }, { status: 400 });
  }

  const b = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = b?.endpoint;
  const p256dh = b?.keys?.p256dh;
  const auth = b?.keys?.auth;
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    !isNonEmptyString(p256dh) ||
    !isNonEmptyString(auth)
  ) {
    return NextResponse.json({ ok: false, message: "מנוי דחיפה לא תקין" }, { status: 400 });
  }

  await upsertSubscription({ userId, endpoint, p256dh, auth });
  logger.info("push_subscribe", { userId });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "גוף הבקשה אינו תקין" }, { status: 400 });
  }

  const endpoint = (body as { endpoint?: unknown } | null)?.endpoint;
  if (typeof endpoint !== "string") {
    return NextResponse.json({ ok: false, message: "מנוי דחיפה לא תקין" }, { status: 400 });
  }

  await deleteByUserAndEndpoint({ userId, endpoint });
  logger.info("push_unsubscribe", { userId });
  return NextResponse.json({ ok: true });
}
