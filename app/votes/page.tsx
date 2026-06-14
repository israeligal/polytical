import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/time";
import {
  getAnnouncedAgendaItems, getFeaturedVotes, getVotesFeed, getVotesFreshness,
} from "@/app/lib/votes/read-repo";
import { VoteRow } from "@/components/vote-row";
import { VoteHeroSpotlight } from "@/components/hero";
import { EmptyState } from "@/components/empty-state";
import { track } from "@/app/lib/track";
import { getSession } from "@/lib/auth";
import { getStancesForVotes } from "@/app/lib/stances/repo";
import { VOTES_PAGE_CONTAINER } from "@/components/skeletons/containers";
import { KnessetSourceFooter } from "@/components/knesset-source-footer";

export const metadata = {
  title: "הצבעות במליאה — פוליטיקל",
  description: "מי הצביע בעד ומי נגד — כל הצבעות הכנסת ה-25, ממקור רשמי.",
};

export default async function VotesPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const { before } = await searchParams;
  const [feed, featured, agenda, freshness, session] = await Promise.all([
    getVotesFeed({ before }),
    before ? Promise.resolve([]) : getFeaturedVotes({}),
    before ? Promise.resolve([]) : getAnnouncedAgendaItems({}),
    getVotesFreshness(),
    getSession(),
  ]);
  track("feed_viewed", { page: before ? "older" : "first" });
  const allIds = [...feed.votes, ...featured].map((v) => v.voteId);
  const myStances = session?.user
    ? await getStancesForVotes({ userId: session.user.id, voteIds: allIds })
    : new Map<number, "for" | "against">();

  // Hero: first admin-featured vote, or first feed vote on page 1 (not paginated views).
  const heroVote = featured[0] ?? (!before ? (feed.votes[0] ?? null) : null);
  const restFeatured = featured.slice(heroVote && heroVote === featured[0] ? 1 : 0);
  const feedVotes = heroVote && !featured[0]
    ? feed.votes.slice(1)
    : feed.votes;

  return (
    <>
      {heroVote && (
        <section className="border-b border-border bg-muted">
          <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
            <VoteHeroSpotlight vote={heroVote} dateHe={formatDate(heroVote.voteDate)} />
          </div>
        </section>
      )}

    <main className={VOTES_PAGE_CONTAINER}>
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-primary">הקלפי של המליאה</p>
          <h1 className="font-display text-3xl font-black text-foreground sm:text-4xl">הצבעות במליאה</h1>
        </div>
        {freshness.latest && (
          <p className="text-xs text-muted-foreground">
            עודכן לאחרונה <span className="nums">{formatDateTime(freshness.latest)}</span>
          </p>
        )}
      </div>
      <p className="mb-6 text-muted-foreground">
        מי בעד, מי נגד ומי נמנע — כל הצבעה במליאת הכנסת ה-25, ישירות מהמקור הרשמי.
      </p>

      {freshness.isStale && freshness.latest && (
        <div className="mb-6 rounded-xl border border-negative bg-negative-soft px-4 py-3 text-sm font-semibold text-negative">
          הנתונים לא התעדכנו מאז <span className="nums">{formatDateTime(freshness.latest)}</span> — ייתכן שחלק
          מההצבעות האחרונות חסרות.
        </div>
      )}

      {restFeatured.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-xl font-bold text-foreground">מצביעים על זה</h2>
          <div className="grid gap-3">
            {restFeatured.map((v) => (
              <VoteRow
                key={v.voteId}
                vote={{ ...v, siblingCount: 0 }}
                dateHe={formatDate(v.voteDate)}
                userStance={myStances.get(v.voteId) ?? null}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        {!before && <h2 className="mb-3 font-display text-xl font-bold text-foreground">הצבעות אחרונות</h2>}
        {feedVotes.length === 0 ? (
          <EmptyState>אין הצבעות להצגה.</EmptyState>
        ) : (
          <div className="grid gap-3">
            {feedVotes.map((v) => (
              <VoteRow key={v.voteId} vote={v} dateHe={formatDate(v.voteDate)} userStance={myStances.get(v.voteId) ?? null} />
            ))}
          </div>
        )}
        {feed.nextBefore && (
          <div className="mt-6 text-center">
            <Link
              href={`/votes?before=${encodeURIComponent(feed.nextBefore)}`}
              className="inline-flex items-center rounded-full border-2 border-primary px-6 py-2.5 text-sm font-bold text-primary transition-all hover:-translate-y-0.5"
            >
              להצבעות קודמות
            </Link>
          </div>
        )}
      </section>

      {agenda.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-display text-xl font-bold text-foreground">על סדר היום</h2>
          <div className="grid gap-2">
            {agenda.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground">
                {a.titleHe}
                {a.expectedDate && (
                  <span className="ms-2 text-xs text-muted-foreground">
                    צפוי: <span className="nums">{formatDate(`${a.expectedDate}T00:00:00Z`)}</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <KnessetSourceFooter />
    </main>
    </>
  );
}
