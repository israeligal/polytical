import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { getAllPoliticians } from "@/app/lib/politicians/repo";
import { SuggestMarketForm } from "@/components/suggest-market-form";

// Public "propose a market" surface (the community half of admin+community).
// Gated to logged-in users; the form posts to a rate-limited server action and
// the proposal lands in the admin review queue. `?person=<personId>` pre-selects
// a politician when arriving from their card.
export default async function SuggestPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsuggest");

  const { person } = await searchParams;
  const personNum = Number(person);
  const defaultPersonId = Number.isInteger(personNum) && personNum > 0 ? personNum : undefined;

  const politicians = (await getAllPoliticians()).map((p) => ({ personId: p.personId, name: p.nameHe }));

  return (
    <main className="mx-auto max-w-2xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-sm font-bold text-primary">מהקהל</p>
        <h1 className="font-display text-3xl font-black text-foreground sm:text-4xl">הציעו שוק</h1>
        <p className="mt-2 text-muted-foreground">
          יש לכם שאלה טובה על הפוליטיקה הישראלית? הציעו אותה. שווקים שמאושרים על ידי
          ההנהלה נפתחים לכל הקהילה. נסחו שאלה שאפשר להכריע באופן חד-משמעי ממקור רשמי.
        </p>
      </header>

      <SuggestMarketForm
        categories={CATEGORIES.map((c) => ({ key: c.key, he: c.he }))}
        politicians={politicians}
        defaultPersonId={defaultPersonId}
      />

      <p className="mt-4 text-xs text-muted-foreground">
        ההצעה נשלחת לבדיקה. תוכלו לעקוב אחר הסטטוס שלה בפרופיל שלכם.
      </p>
    </main>
  );
}
