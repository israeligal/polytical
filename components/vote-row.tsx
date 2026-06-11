// One feed row for a Knesset vote (primary vote of its item). RSC-safe,
// presentational — the page supplies the row + display strings (dates are
// pre-formatted server-side via lib/time so the ESLint Intl guard holds).

import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { VoteTotalsBar } from "@/components/vote-totals-bar";
import type { FeedVote } from "@/app/lib/votes/read-repo";

const TYPE_HE: Record<FeedVote["voteType"], string> = {
  electronic: "הצבעה אלקטרונית",
  roll_call: "הצבעה שמית",
  hand: "הצבעה בהרמת ידיים",
  secret: "הצבעה חשאית",
};

export function VoteRow({
  vote,
  dateHe,
  userStance,
}: {
  vote: FeedVote;
  dateHe: string;
  /** The viewer's recorded עמדה — display-only chip; setting happens on the detail page. */
  userStance?: "for" | "against" | null;
}) {
  return (
    <Link
      href={`/vote/${vote.voteId}`}
      className="block rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-sm font-bold leading-snug text-foreground">{vote.titleHe}</h3>
        <span className="flex shrink-0 items-center gap-1.5">
          {userStance && (
            <StatusChip tone={userStance === "for" ? "positive" : "negative"}>
              העמדה שלי: {userStance === "for" ? "בעד" : "נגד"}
            </StatusChip>
          )}
          {vote.isAccepted != null && (
            <StatusChip tone={vote.isAccepted ? "positive" : "negative"}>
              {vote.isAccepted ? "התקבל" : "נדחה"}
            </StatusChip>
          )}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="nums">{dateHe}</span> · {TYPE_HE[vote.voteType]}
        {vote.siblingCount > 0 && (
          <>
            {" · "}
            <span className="nums">{vote.siblingCount}</span> הצבעות נוספות באותה הצעה
          </>
        )}
      </p>
      <VoteTotalsBar
        className="mt-3"
        totals={{ totalFor: vote.totalFor, totalAgainst: vote.totalAgainst, totalAbstain: vote.totalAbstain }}
      />
    </Link>
  );
}
