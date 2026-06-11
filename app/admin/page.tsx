import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { listManageableMarkets, getOutcomeCounts } from "@/app/lib/markets/repo";
import { listSuggestions } from "@/app/lib/suggestions/service";
import { getAllPoliticians } from "@/app/lib/politicians/repo";
import { CreateMarketForm } from "@/components/admin/create-market-form";
import { MarketAdminRow } from "@/components/admin/market-admin-row";
import { SuggestionReviewRow } from "@/components/admin/suggestion-review-row";

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

  return (
    <main className="mx-auto max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-sm font-bold text-primary">קונסולת ניהול</p>
        <h1 className="font-display text-3xl font-black text-foreground">ניהול תחזיות</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          יצירת תחזיות, הכרעה (סיכום מי ניחש נכון) וביטול תחזית. ההכרעה מעדכנת את
          רשומת הניחושים של כל מי שניחש.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="mb-3 font-display text-xl font-bold text-foreground">תחזית חדשה</h2>
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
          תחזיות בניהול ({manageable.length})
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
            אין תחזיות בניהול כרגע.
          </p>
        )}
      </section>
    </main>
  );
}
