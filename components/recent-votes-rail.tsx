// Aside rail showing recent Knesset votes — mirrors HotRail visual conventions.
// RSC presentational: all data is passed in by the page, no client state.

import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { Ballot } from "@/components/icons";
import { formatDate } from "@/lib/time";
import type { KnessetVoteRow } from "@/app/lib/votes/read-repo";

export function RecentVotesRail({ votes }: { votes: KnessetVoteRow[] }) {
  if (votes.length === 0) return null;

  return (
    <aside className="flex flex-col rounded-card border border-border bg-card shadow-2">
      <p className="flex items-center gap-1.5 border-b border-border px-4 py-3 font-accent text-sm font-bold text-foreground">
        <Ballot className="h-4 w-4 text-muted-foreground" />
        הצבעות אחרונות
      </p>
      <ul className="flex-1">
        {votes.map((vote) => (
          <li key={vote.voteId} className="border-b border-border last:border-b-0">
            <Link
              href={`/vote/${vote.voteId}`}
              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-raised"
            >
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-bold text-foreground">{vote.titleHe}</span>
                <span className="nums mt-0.5 block text-xs text-muted-foreground">
                  {formatDate(vote.voteDate)}
                </span>
              </span>
              {vote.isAccepted != null && (
                <StatusChip tone={vote.isAccepted ? "positive" : "negative"}>
                  {vote.isAccepted ? "התקבל" : "נדחה"}
                </StatusChip>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/votes"
        className="border-t border-border px-4 py-3 text-center text-sm font-bold text-primary transition-colors hover:bg-raised"
      >
        לכל ההצבעות
      </Link>
    </aside>
  );
}
