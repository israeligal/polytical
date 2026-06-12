// Official item context for a vote: collapsible description (native <details>,
// zero client JS) + always-visible official links. Sources are OFFICIAL ONLY
// (SummaryLaw / extracted דברי הסבר / motion text) — the attribution line names
// which. An item with no official text renders the links block alone.

import Link from "next/link";
import { ChevronForward } from "@/components/icons";
import type { VoteItemDetail } from "@/app/lib/votes/read-repo";

const SOURCE_LABEL: Record<string, string> = {
  summary_law: "התקציר הרשמי, מאגר החקיקה הלאומי",
  explanatory_notes: "דברי ההסבר מתוך נוסח הצעת החוק הרשמי",
  motion_text: "דברי ההסבר מתוך נוסח ההצעה לסדר היום",
};

export function VoteDescription({ item }: { item: VoteItemDetail }) {
  const { item: row, initiator } = item;
  const hasDescription = row.descriptionHe != null && row.descriptionSource != null;
  const hasLinks = row.legislationUrl != null || row.docUrl != null || initiator != null;
  if (!hasDescription && !hasLinks) return null;

  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-4">
      {hasDescription ? (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            על מה ההצבעה?
            <ChevronForward
              aria-hidden
              className="h-4 w-4 shrink-0 rotate-90 text-muted-foreground transition-transform group-open:-rotate-90"
            />
          </summary>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {row.descriptionHe}
          </p>
          <p className="mt-2 text-xs text-muted-foreground/70">{SOURCE_LABEL[row.descriptionSource!]}</p>
        </details>
      ) : null}
      {hasLinks ? (
        <div className={hasDescription ? "mt-3 border-t border-border pt-3" : undefined}>
          <ul className="flex flex-col gap-1 text-sm">
            {row.legislationUrl ? (
              <li>
                <a href={row.legislationUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  לדף הצעת החוק במאגר החקיקה הלאומי
                </a>
              </li>
            ) : null}
            {row.docUrl ? (
              <li>
                <a href={row.docUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {row.docTypeDescHe ? `לנוסח הרשמי (PDF) — ${row.docTypeDescHe}` : "לנוסח הרשמי (PDF)"}
                </a>
              </li>
            ) : null}
            {initiator ? (
              <li className="text-muted-foreground">
                הוגשה על ידי{" "}
                <Link href={`/politician/${initiator.personId}`} className="text-primary hover:underline">
                  {initiator.nameHe}
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
