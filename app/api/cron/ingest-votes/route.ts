import { NextResponse } from "next/server";
import { ingestRecentVotes } from "@/app/lib/votes/service";
import { resolveAgendaItems } from "@/app/lib/agenda/resolve";
import { logger } from "@/app/lib/logger";

// Scheduled vote ingest (vercel.json: every 2h). Last-7-days incremental —
// idempotent, so overlapping windows are harmless. Roster/stints refresh stays
// with the manual/daily `pnpm ingest:knesset` (a brand-new replacement MK's
// name simply queues until that runs — the review queue is the safety net).
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.warn("cron.ingest_votes.no_secret");
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const result = await ingestRecentVotes();
    // A freshly-landed decisive vote may close out a pre-voting agenda item —
    // adopt its stances now so matching reflects them within the cron cadence.
    const agenda = await resolveAgendaItems();
    logger.info("cron.ingest_votes.done", { ...result, agenda });
    return NextResponse.json({ ok: true, ...result, agenda });
  } catch (err) {
    // Surface a 500 so Vercel cron marks the run failed (visible in the dashboard).
    logger.error("cron.ingest_votes.failed", { err: String(err) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
