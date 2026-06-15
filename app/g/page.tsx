import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listMyGroups } from "@/app/lib/groups/service";
import { EmptyState } from "@/components/empty-state";
import { CoalitionExplainer } from "@/components/groups/coalition-explainer";
import { GROUPS_CONTAINER } from "@/components/skeletons/containers";

export default async function MyGroupsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=%2Fg");
  const groups = await listMyGroups({ userId: session.user.id });

  return (
    <main className={GROUPS_CONTAINER}>
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="font-accent text-sm font-bold text-primary">הקואליציות שלך</p>
          <h1 className="font-display text-3xl text-foreground sm:text-4xl">קואליציות</h1>
        </div>
        <Link
          href="/g/new"
          className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          + קואליציה חדשה
        </Link>
      </header>

      {groups.length === 0 ? (
        <div className="space-y-4">
          <EmptyState>
            עדיין אינכם בקואליציה. צרו אחת, או הצטרפו דרך קישור הזמנה שקיבלתם מחבר/ה.
          </EmptyState>
          <CoalitionExplainer />
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/g/${g.slug}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary"
              >
                <span aria-hidden className="text-2xl leading-none">{g.emblem ?? "🏛️"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-lg font-bold text-foreground">{g.nameHe}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.role === "owner" ? "בעלים" : g.role === "admin" ? "מנהל/ת" : "חבר/ה"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
