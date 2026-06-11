import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { computeMatch, LOW_CONFIDENCE_BELOW, type MkMatch } from "@/app/lib/match/service";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { PoliticianPortrait } from "@/components/politician-portrait";
import { track } from "@/app/lib/track";
import { MY_MATCH_CONTAINER } from "@/components/skeletons/containers";

export const metadata = {
  title: "מי מצביע כמוכם? — פוליטיקל",
  description: "ההתאמה בין העמדות שלכם להצבעות האמיתיות של חברי הכנסת.",
};

function MkMatchRow({ m }: { m: MkMatch }) {
  return (
    <li>
      <Link
        href={`/politician/${m.politician.personId}`}
        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <PoliticianPortrait politician={dbToCard(m.politician)} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-foreground">{m.politician.nameHe}</span>
          <span className="block text-xs text-muted-foreground">{m.politician.party ?? ""}</span>
        </span>
        <span className="text-end">
          <span className="nums block font-display text-2xl font-black text-primary">{m.agreementPct}%</span>
          <span className="nums block text-xs text-muted-foreground">{m.shared} הצבעות משותפות</span>
          {m.lowConfidence && (
            <span className="block text-[11px] font-semibold text-muted-foreground">מבוסס על מעט הצבעות</span>
          )}
        </span>
      </Link>
    </li>
  );
}

export default async function MyMatchPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=%2Fmy-match");

  const result = await computeMatch({ userId: session.user.id });
  track("match_viewed", { state: result.state });

  return (
    <main className={MY_MATCH_CONTAINER}>
      <p className="text-sm font-bold text-primary">העמדות שלכם מול המליאה</p>
      <h1 className="font-display text-3xl font-black text-foreground sm:text-4xl">מי מצביע כמוכם?</h1>
      <p className="mt-2 mb-8 text-muted-foreground">
        ההתאמה מחושבת מהשוואת העמדות שלכם להצבעות האמיתיות של חברי הכנסת — רק על ההצבעות המכריעות.
      </p>

      {result.state === "locked" ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/50 px-6 py-12 text-center">
          <p className="font-display text-xl font-bold text-foreground">
            קבעו עמדה על עוד <span className="nums">{result.needed}</span> הצעות כדי לפתוח את ההתאמה
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            עד עכשיו קבעתם <span className="nums">{result.scoreableCount}</span> עמדות על הצבעות מכריעות. ככל
            שתקבעו יותר עמדות, ההתאמה תדייק.
          </p>
          <Link
            href="/votes"
            className="mt-5 inline-flex items-center rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:-translate-y-0.5"
          >
            להצבעות האחרונות
          </Link>
        </div>
      ) : (
        <>
          {result.mode === "panels" ? (
            <div className="grid gap-8 sm:grid-cols-2">
              <section>
                <h2 className="mb-3 font-display text-xl font-bold text-positive">הכי מסכימים איתכם</h2>
                <ul className="grid gap-2">
                  {result.top.map((m) => (
                    <MkMatchRow key={m.politician.personId} m={m} />
                  ))}
                </ul>
              </section>
              <section>
                <h2 className="mb-3 font-display text-xl font-bold text-negative">הכי פחות מסכימים</h2>
                <ul className="grid gap-2">
                  {result.bottom.map((m) => (
                    <MkMatchRow key={m.politician.personId} m={m} />
                  ))}
                </ul>
              </section>
            </div>
          ) : (
            <section>
              <h2 className="mb-3 font-display text-xl font-bold text-foreground">ההתאמות שנמדדו עד כה</h2>
              {result.top.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
                  אף ח״כ עוד לא הגיע למספיק הצבעות משותפות איתכם.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {result.top.map((m) => (
                    <MkMatchRow key={m.politician.personId} m={m} />
                  ))}
                </ul>
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                קבעו עמדה על עוד הצעות כדי לדייק את ההתאמה ולפתוח את הרשימה המלאה.
              </p>
            </section>
          )}

          <section className="mt-10">
            <h2 className="mb-3 font-display text-xl font-bold text-foreground">ומה עם הסיעות?</h2>
            {result.bestParty ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs font-bold text-positive">הסיעה הקרובה אליכם</p>
                  <p className="mt-1 truncate font-bold text-foreground">{result.bestParty.nameHe}</p>
                  <p className="nums mt-1 text-sm text-muted-foreground">
                    {result.bestParty.agreementPct}% · {result.bestParty.shared} הצבעות
                  </p>
                </div>
                {result.worstPartyHidden === "tie" && (
                  <div className="rounded-xl border border-dashed border-border bg-muted/50 p-4 text-center">
                    <p className="text-sm font-semibold text-foreground">כל הסיעות שנמדדו מסכימות איתכם באותה מידה</p>
                    <p className="mt-1 text-xs text-muted-foreground">קבעו עמדה על הצעות שנויות במחלוקת כדי לבדל ביניהן.</p>
                  </div>
                )}
                {result.worstParty && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs font-bold text-negative">הסיעה הרחוקה מכם</p>
                    <p className="mt-1 truncate font-bold text-foreground">{result.worstParty.nameHe}</p>
                    <p className="nums mt-1 text-sm text-muted-foreground">
                      {result.worstParty.agreementPct}% · {result.worstParty.shared} הצבעות
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
                עוד אין מספיק נתונים להתאמה סיעתית.
              </p>
            )}
          </section>

          <p className="mt-8 text-xs text-muted-foreground">
            עמדות שאינן בעד/נגד (נמנע, לא הצביע, היעדרות) אינן נספרות. ההתאמה מחושבת מחדש בכל צפייה — שינוי
            עמדה משנה אותה מיד. ח״כ נכלל רק עם <span className="nums">5</span> הצבעות משותפות לפחות; פחות מ-
            <span className="nums">{LOW_CONFIDENCE_BELOW}</span> מסומן כמבוסס על מעט הצבעות.
          </p>
        </>
      )}
    </main>
  );
}
