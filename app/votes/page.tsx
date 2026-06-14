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

// Pill classes mirror components/category-rail.tsx so the two filter rows read
// as the same control across the app.
const PILL =
  "inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 py-1.5 font-accent text-[13.5px] font-bold transition-colors";
const PILL_ON = "border-primary bg-primary text-primary-foreground";
const PILL_OFF = "border-border bg-card text-muted-foreground hover:text-foreground";

export const metadata = {
  title: "הצבעות במליאה — פוליטיקל",
  description: "מי הצביע בעד ומי נגד — כל הצבעות הכנסת ה-25, ממקור רשמי.",
};

export default async function VotesPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; result?: string; type?: string }>;
}) {
  const { before, result, type } = await searchParams;
  // Official facets only (no topic taxonomy exists at the source): outcome +
  // "has per-MK breakdown". Unknown values are simply ignored → unfiltered.
  const accepted = result === "accepted" ? true : result === "rejected" ? false : undefined;
  const withBreakdown = type === "breakdown" || undefined;
  const filter = { accepted, withBreakdown };
  const filterQuery = ({ r, t, b }: { r?: string; t?: string; b?: string }) => {
    const params = new URLSearchParams();
    if (r) params.set("result", r);
    if (t) params.set("type", t);
    if (b) params.set("before", b);
    const qs = params.toString();
    return qs ? `/votes?${qs}` : "/votes";
  };
  const [feed, featured, agenda, freshness, session] = await Promise.all([
    getVotesFeed({ before, filter }),
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

      {/* Filter pills — same look as the markets CategoryRail. Result pills and
          the breakdown pill toggle independently; each href preserves the other. */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        <Link
          href={filterQuery({ t: type })}
          scroll={false}
          className={`${PILL} ${accepted === undefined ? PILL_ON : PILL_OFF}`}
        >
          הכול
        </Link>
        <Link
          href={filterQuery({ r: result === "accepted" ? undefined : "accepted", t: type })}
          scroll={false}
          className={`${PILL} ${accepted === true ? PILL_ON : PILL_OFF}`}
        >
          התקבלו
        </Link>
        <Link
          href={filterQuery({ r: result === "rejected" ? undefined : "rejected", t: type })}
          scroll={false}
          className={`${PILL} ${accepted === false ? PILL_ON : PILL_OFF}`}
        >
          נדחו
        </Link>
        <Link
          href={filterQuery({ r: result, t: withBreakdown ? undefined : "breakdown" })}
          scroll={false}
          className={`${PILL} ${withBreakdown ? PILL_ON : PILL_OFF}`}
        >
          עם פירוט אישי
        </Link>
      </div>

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

      <section className="min-h-[24rem]">
        {!before && <h2 className="mb-3 font-display text-xl font-bold text-foreground">הצבעות אחרונות</h2>}
        {feedVotes.length === 0 ? (
          <EmptyState>
            {accepted !== undefined || withBreakdown
              ? "אין הצבעות תואמות לסינון הזה."
              : "אין הצבעות להצגה."}
          </EmptyState>
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
              href={filterQuery({ r: result, t: type, b: feed.nextBefore })}
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
