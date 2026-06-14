import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { GroupCreateForm } from "@/components/groups/group-create-form";
import { ChevronForward } from "@/components/icons";
import { GROUPS_CONTAINER } from "@/components/skeletons/containers";

export default async function NewGroupPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=%2Fg%2Fnew");

  return (
    <main className={GROUPS_CONTAINER}>
      <Link
        href="/g"
        className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronForward className="h-4 w-4 rotate-180" />
        חזרה לקואליציות
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-3xl text-foreground sm:text-4xl">קואליציה חדשה</h1>
        <p className="mt-1 text-sm text-muted-foreground">מועדון תחזיות פרטי. אתם תהיו הבעלים.</p>
      </header>

      <div className="mb-6 rounded-2xl border border-border bg-card p-4 text-sm shadow-sm">
        <h2 className="mb-2 font-display text-base font-bold text-foreground">מה זו קואליציה?</h2>
        <ul className="space-y-1.5 text-muted-foreground">
          <li>🗳️ הצעות לסדר משלכם — כל חבר מעלה, כולם מנבאים</li>
          <li>🏆 לוח תוצאות נפרד — מי הכי מדייק בקבוצה</li>
          <li>💬 מליאה — דיון על כל הצעה</li>
          <li>🔒 פרטי: רק חברים רואים את ההצעות, התוצאות והדיון</li>
          <li>🔗 מצטרפים בהזמנה בלבד</li>
          <li>🤝 שיתוף עמדות הכנסת — רק אם תבחרו, וגם אז רק בין חברים</li>
        </ul>
      </div>

      <GroupCreateForm />
    </main>
  );
}
