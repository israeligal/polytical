import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/time";
import { getVoteDetail, type MkVoteWithPolitician } from "@/app/lib/votes/read-repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { PoliticianPortrait } from "@/components/politician-portrait";
import { StatusChip, type ChipTone } from "@/components/status-chip";
import { VoteTotalsBar } from "@/components/vote-totals-bar";
import { ChevronForward } from "@/components/icons";
import { track } from "@/app/lib/track";
import { getSession } from "@/lib/auth";
import { getStanceState, MATCH_UNLOCK_THRESHOLD } from "@/app/lib/stances/service";
import { StanceWidget } from "@/components/stance-widget";
import { VOTE_TYPE_HE } from "@/components/vote-row";
import { VOTE_PAGE_CONTAINER } from "@/components/skeletons/containers";

const RESULT_HE: Record<MkVoteWithPolitician["result"], { label: string; tone: ChipTone }> = {
  for: { label: "בעד", tone: "positive" },
  against: { label: "נגד", tone: "negative" },
  abstain: { label: "נמנע", tone: "abstain" },
  didnt_vote: { label: "נוכח ולא הצביע", tone: "neutral" },
};

interface FactionGroup {
  name: string;
  members: MkVoteWithPolitician[];
}

/** Group by faction-at-vote-time, largest first; null faction last. */
function groupByFaction(breakdown: MkVoteWithPolitician[]): FactionGroup[] {
  const groups = new Map<string, MkVoteWithPolitician[]>();
  for (const row of breakdown) {
    const name = row.factionNameHe ?? "ללא שיוך סיעתי";
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([name, members]) => ({
      name,
      members: members.sort((a, b) => a.result.localeCompare(b.result)),
    }))
    .sort((a, b) => b.members.length - a.members.length);
}

export default async function VotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const voteId = Number(id);
  const [detail, session] = Number.isInteger(voteId)
    ? await Promise.all([getVoteDetail({ voteId }), getSession()])
    : [null, null];
  if (!detail) notFound();
  const { vote, breakdown, withheldCount, siblings } = detail;
  const groups = groupByFaction(breakdown);
  track("motion_viewed", { voteId: vote.voteId });

  // Full stance state (incl. k-gated aggregate + match progress) so a
  // returning user sees their aggregate immediately, not only post-cast.
  // Decisive votes only — the widget never renders elsewhere, so non-decisive
  // pages (~2/3 of votes) skip the stance queries entirely.
  const stanceState =
    session?.user && vote.isDecisive
      ? await getStanceState({ userId: session.user.id, voteId: vote.voteId })
      : null;

  const isPending = vote.detailsStatus === "pending_details";
  const nonVoters = vote.totalDidntVote ?? 0;

  return (
    <main className={VOTE_PAGE_CONTAINER}>
      <Link
        href="/votes"
        className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronForward className="h-4 w-4 rotate-180" />
        חזרה להצבעות
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 font-display text-2xl font-black leading-snug text-foreground sm:text-3xl">
          {vote.titleHe}
        </h1>
        {vote.isAccepted != null && (
          <StatusChip tone={vote.isAccepted ? "positive" : "negative"}>
            {vote.isAccepted ? "התקבל" : "נדחה"}
          </StatusChip>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        <span className="nums">{formatDateTime(vote.voteDate)}</span> · {VOTE_TYPE_HE[vote.voteType]}
        {vote.decisionHe && <> · {vote.decisionHe}</>}
      </p>

      {/* עמדה widget ABOVE the breakdown — capture the user's opinion before
          (or at least alongside) the Knesset outcome anchoring them. */}
      {vote.isDecisive && (
        <StanceWidget
          voteId={vote.voteId}
          loggedIn={Boolean(session?.user)}
          initialStance={stanceState?.stance ?? null}
          initialAggregate={stanceState?.aggregate ?? null}
          initialProgress={
            stanceState
              ? { scoreableCount: stanceState.scoreableCount, unlockThreshold: MATCH_UNLOCK_THRESHOLD }
              : null
          }
        />
      )}

      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        {isPending ? (
          <p className="text-center text-sm font-semibold text-muted-foreground">הפירוט בדרך — הנתונים נטענים מהכנסת.</p>
        ) : (
          <>
            <VoteTotalsBar
              totals={{ totalFor: vote.totalFor, totalAgainst: vote.totalAgainst, totalAbstain: vote.totalAbstain }}
            />
            {nonVoters > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                ועוד <span className="nums">{nonVoters}</span> ח״כים נכחו ולא הצביעו.
              </p>
            )}
          </>
        )}
        <a
          href={vote.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
        >
          למקור הרשמי באתר הכנסת
        </a>
      </div>

      {vote.voteType === "hand" && !isPending && (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-muted/50 px-4 py-4 text-center text-sm text-muted-foreground">
          אין פירוט אישי בהצבעה בהרמת ידיים — רק הסיכום הרשמי.
        </p>
      )}
      {vote.voteType === "secret" && (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-muted/50 px-4 py-4 text-center text-sm text-muted-foreground">
          הצבעה חשאית — אין פירוט אישי.
        </p>
      )}

      {breakdown.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 font-display text-xl font-bold text-foreground">מי הצביע מה</h2>
          {withheldCount > 0 && (
            <p className="mb-3 text-xs font-semibold text-muted-foreground">
              <span className="nums">{withheldCount}</span> הצבעות ממתינות לאימות זהות ואינן מוצגות עדיין.
            </p>
          )}
          <div className="mt-3 grid gap-4">
            {groups.map((g) => (
              <div key={g.name} className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-3 text-sm font-bold text-foreground">{g.name}</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {g.members.map((m) => {
                    const r = RESULT_HE[m.result];
                    return (
                      <li key={m.personId}>
                        <Link
                          href={`/politician/${m.personId}`}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60"
                        >
                          {m.politician ? (
                            <PoliticianPortrait politician={dbToCard(m.politician)} size="sm" />
                          ) : (
                            <span className="h-9 w-9 rounded-full bg-muted" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                            {m.politician?.nameHe ?? `ח״כ ${m.personId}`}
                          </span>
                          <StatusChip tone={r.tone}>{r.label}</StatusChip>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {siblings.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-bold text-foreground">
            עוד הצבעות באותה הצעה <span className="nums">({siblings.length})</span>
          </h2>
          <ul className="grid gap-2">
            {siblings.map((s) => (
              <li key={s.voteId}>
                <Link
                  href={`/vote/${s.voteId}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/60"
                >
                  <span className="min-w-0 flex-1 truncate">{s.decisionHe ?? VOTE_TYPE_HE[s.voteType]}</span>
                  {s.isAccepted != null && (
                    <StatusChip tone={s.isAccepted ? "positive" : "negative"}>
                      {s.isAccepted ? "התקבל" : "נדחה"}
                    </StatusChip>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-xs text-muted-foreground">נתונים ממקור רשמי · אתר הכנסת</p>
    </main>
  );
}
