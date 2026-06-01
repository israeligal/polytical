import Link from "next/link";
import { notFound } from "next/navigation";
import { getPoliticianActivity, getPoliticianByPersonId } from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { CaricatureCard } from "@/components/caricature-card";
import { ChevronForward } from "@/components/icons";

export default async function PoliticianPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = Number(id);
  const row = Number.isInteger(personId)
    ? await getPoliticianByPersonId({ personId })
    : null;
  if (!row) notFound();

  const politician = dbToCard(row);
  const activity = await getPoliticianActivity({ personId });

  return (
    <main className="mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/politicians"
        className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronForward className="h-4 w-4 rotate-180" />
        חזרה לפוליטיקאים
      </Link>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <CaricatureCard politician={politician} realData />
        </div>

        <div>
          <h1 className="font-display text-3xl font-black text-foreground sm:text-4xl">
            {politician.name}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {politician.role} · {politician.party}
          </p>

          <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {politician.facts.map((f) => (
              <div
                key={f.label}
                className="flex items-center justify-between gap-3 bg-card px-4 py-3"
              >
                <dt className="text-sm text-muted-foreground">{f.label}</dt>
                <dd className="nums text-sm font-bold text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>

          <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">
            פעילות פרלמנטרית
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card px-4 py-4 text-center">
              <p className="nums font-display text-3xl font-black text-primary">
                {activity.billCount}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">הצעות חוק</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-4 text-center">
              <p className="nums font-display text-3xl font-black text-primary">
                {activity.queryCount}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">שאילתות</p>
            </div>
          </div>
          {activity.recentBills.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-sm font-bold text-primary">
                הצעות חוק אחרונות
              </h3>
              <ul className="space-y-2">
                {activity.recentBills.map((b) => (
                  <li
                    key={b.billId}
                    className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground"
                  >
                    {b.nameHe}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            נתונים ממקור רשמי · הכנסת (OData)
          </p>

          <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">
            השווקים של {politician.name}
          </h2>
          <div className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-10 text-center">
            <p className="font-display text-lg font-bold text-foreground">
              שווקים בקרוב
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              עוד לא נפתחו שווקים סביב {politician.name}. בקרוב תוכלו לנחש על
              ההחלטות והאירועים שלו/ה.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
