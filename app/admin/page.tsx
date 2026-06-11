import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { listManageableMarkets, getOutcomeCounts } from "@/app/lib/markets/repo";
import { listSuggestions } from "@/app/lib/suggestions/service";
import { getAllPoliticians } from "@/app/lib/politicians/repo";
import { CreateMarketForm } from "@/components/admin/create-market-form";
import { MarketAdminRow } from "@/components/admin/market-admin-row";
import { SuggestionReviewRow } from "@/components/admin/suggestion-review-row";
import { AgendaAdmin, UnmappedNameRow, VoteFeatureToggle } from "@/components/admin/votes-admin";
import {
  listAgendaItemsForAdmin, listPendingUnmappedNames, listRecentVotesForAdmin,
} from "@/app/lib/votes/read-repo";
import { politicians } from "@/app/lib/schema";
import { db } from "@/app/lib/db";
import { formatDate } from "@/lib/time";

// Minimal admin console (Server Component). The `/admin` route is gated by
// proxy.ts (requires a session); here we additionally redirect non-admins, and
// every mutating server action re-checks `isAdmin` server-side. Functional-plain
// on the design tokens — internal tool, not a public surface.
export default async function AdminPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=%2Fadmin");
  if (!session.user.isAdmin) redirect("/");

  const manageable = await listManageableMarkets();
  // Live predictor counts per market for the crowd-split display.
  const countsByMarket = new Map<string, Map<string, number>>();
  await Promise.all(
    manageable.map(async ({ market }) => {
      countsByMarket.set(market.id, await getOutcomeCounts({ marketId: market.id }));
    }),
  );
  const pendingSuggestions = await listSuggestions({ status: "pending" });
  const nameByPersonId = new Map<number, string>();
  if (pendingSuggestions.some((s) => s.personId != null)) {
    for (const p of await getAllPoliticians()) nameByPersonId.set(p.personId, p.nameHe);
  }

  // Votes domain: identity queue needs the FULL roster (a queued name may be a
  // departed MK — getAllPoliticians filters active, so query directly).
  const [unmappedNames, recentVotes, agendaList] = await Promise.all([
    listPendingUnmappedNames(),
    listRecentVotesForAdmin(),
    listAgendaItemsForAdmin(),
  ]);
  const fullRoster = unmappedNames.length
    ? (await db.select({ personId: politicians.personId, nameHe: politicians.nameHe }).from(politicians)).map(
        (p) => ({ personId: p.personId, name: p.nameHe }),
      )
    : [];

  return (
    <main className="mx-auto max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-sm font-bold text-primary">קונסולת ניהול</p>
        <h1 className="font-display text-3xl font-black text-foreground">ניהול שווקים</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          יצירת שווקים, הכרעה (סיכום מי ניחש נכון) וביטול שוק. ההכרעה מעדכנת את
          רשומת הניחושים של כל מי שניחש.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="mb-3 font-display text-xl font-bold text-foreground">שוק חדש</h2>
        <CreateMarketForm
          categories={CATEGORIES.map((c) => ({ key: c.key, he: c.he }))}
        />
      </section>

      <section className="mb-12">
        <h2 className="mb-3 font-display text-xl font-bold text-foreground">
          הצעות לסדר ({pendingSuggestions.length})
        </h2>
        {pendingSuggestions.length > 0 ? (
          <div className="space-y-4">
            {pendingSuggestions.map((s) => (
              <SuggestionReviewRow
                key={s.id}
                suggestionId={s.id}
                questionHe={s.questionHe}
                categoryHe={categoryLabel(s.category)}
                proposerName={s.proposerName}
                personName={s.personId != null ? nameByPersonId.get(s.personId) ?? null : null}
                createdAtIso={s.createdAt.toISOString()}
                proposedCloseAtIso={s.proposedCloseAt ? s.proposedCloseAt.toISOString() : null}
                resolutionSourceNote={s.resolutionSourceNote}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-10 text-center text-muted-foreground">
            אין הצעות הממתינות לבדיקה.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-bold text-foreground">
          שווקים פתוחים וסגורים ({manageable.length})
        </h2>
        {manageable.length > 0 ? (
          <div className="space-y-4">
            {manageable.map(({ market, outcomes }) => (
              <MarketAdminRow
                key={market.id}
                marketId={market.id}
                questionHe={market.questionHe}
                category={categoryLabel(market.category)}
                status={market.status}
                closeAtIso={market.closeAt.toISOString()}
                outcomes={outcomes.map((o) => ({
                  id: o.id,
                  labelHe: o.labelHe,
                  predictors: countsByMarket.get(market.id)?.get(o.id) ?? 0,
                }))}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-10 text-center text-muted-foreground">
            אין שווקים פתוחים או סגורים כרגע.
          </p>
        )}
      </section>

      <section className="mb-12">
        <h2 className="mb-3 font-display text-xl font-bold text-foreground">
          שמות ממתינים לאימות זהות ({unmappedNames.length})
        </h2>
        {unmappedNames.length > 0 ? (
          <div className="grid gap-2">
            {unmappedNames.map((n) => (
              <UnmappedNameRow
                key={n.nameKey}
                nameKey={n.nameKey}
                nameRaw={n.nameRaw}
                occurrences={n.occurrences}
                roster={fullRoster}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-10 text-center text-muted-foreground">
            אין שמות ממתינים — כל הצבעה משויכת.
          </p>
        )}
      </section>

      <section className="mb-12">
        <h2 className="mb-3 font-display text-xl font-bold text-foreground">הצבעות מובילות</h2>
        <div className="grid gap-2">
          {recentVotes.map((v) => (
            <VoteFeatureToggle
              key={v.voteId}
              voteId={v.voteId}
              titleHe={v.titleHe}
              dateHe={formatDate(v.voteDate)}
              initialFeatured={v.featured}
            />
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 font-display text-xl font-bold text-foreground">סדר היום ({agendaList.length})</h2>
        <AgendaAdmin
          items={agendaList.map((a) => ({
            id: a.id,
            titleHe: a.titleHe,
            expectedDate: a.expectedDate,
            status: a.status,
          }))}
        />
      </section>
    </main>
  );
}
