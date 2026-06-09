import { NextResponse } from "next/server";
import { notifyClosingSoonMarkets } from "@/app/lib/markets/service";
import { logger } from "@/app/lib/logger";

// Vercel Cron hits this hourly (see vercel.json) to send a one-time "closing
// soon" push to bettors of markets about to close. Node runtime — the dispatch
// path reaches the push services over HTTP via web-push.
export const runtime = "nodejs";

/**
 * Auth: Vercel Cron attaches `Authorization: Bearer ${CRON_SECRET}` to scheduled
 * invocations when CRON_SECRET is set in the project env. We reject anything that
 * doesn't match, so the endpoint can't be triggered by the public. Absent secret
 * → 503 (refuse to run unauthenticated rather than expose an open trigger).
 */
export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.warn("cron.closing_soon.no_secret");
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { notified } = await notifyClosingSoonMarkets({});
  logger.info("cron.closing_soon.done", { notified });
  return NextResponse.json({ ok: true, notified });
}
