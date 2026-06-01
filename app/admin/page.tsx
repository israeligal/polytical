import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { listManageableMarkets } from "@/app/lib/markets/repo";
import { CreateMarketForm } from "@/components/admin/create-market-form";
import { MarketAdminRow } from "@/components/admin/market-admin-row";

// Minimal admin console (Server Component). The `/admin` route is gated by
// proxy.ts (requires a session); here we additionally redirect non-admins, and
// every mutating server action re-checks `isAdmin` server-side. Functional-plain
// on the design tokens — internal tool, not a public surface.
export default async function AdminPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=%2Fadmin");
  if (!session.user.isAdmin) redirect("/");

  const manageable = await listManageableMarkets();

  return (
    <main className="mx-auto max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-sm font-bold text-primary">קונסולת ניהול</p>
        <h1 className="font-display text-3xl font-black text-foreground">ניהול שווקים</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          יצירת שווקים, הכרעה (חלוקת הקופה לזוכים) וביטול (החזר מלא). כל תנועת מטבעות
          עוברת דרך ספר החשבונות.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="mb-3 font-display text-xl font-bold text-foreground">שוק חדש</h2>
        <CreateMarketForm
          categories={CATEGORIES.map((c) => ({ key: c.key, he: c.he }))}
        />
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
                category={categoryLabel(market.category as Parameters<typeof categoryLabel>[0])}
                status={market.status}
                closeAtIso={market.closeAt.toISOString()}
                outcomes={outcomes.map((o) => ({
                  id: o.id,
                  labelHe: o.labelHe,
                  poolTotal: o.poolTotal,
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
    </main>
  );
}
