// "נחקק כחוק" — when a bill became one or more enacted laws (KNS_IsraelLaw via
// the israel_law_bills link), show each law with its in-force/expired status and
// the official topic tags (KNS_IsraelLawClassificiation — the only topic taxonomy
// in the source). RSC, presentational; tokens + logical props + Hebrew.

import type { BillEnactedLaw } from "@/app/lib/bills/repo";
import { StatusChip } from "@/components/status-chip";
import { TopicBadge } from "@/components/badges";
import { formatDate } from "@/lib/time";

export function EnactedLawPanel({ laws }: { laws: BillEnactedLaw[] }) {
  if (laws.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">נחקק כחוק</h2>
      <ul className="space-y-3">
        {laws.map((law) => {
          // Validity vocab (verified): תקף = in force (positive); בטל/פקע/נושן = no longer.
          const inForce = law.validityDesc === "תקף";
          return (
            <li key={law.israelLawId} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0 font-semibold text-foreground">{law.nameHe}</span>
                {law.validityDesc && (
                  <StatusChip tone={inForce ? "positive" : "neutral"}>{law.validityDesc}</StatusChip>
                )}
              </div>
              {law.publicationDate && (
                <p className="nums mt-1 text-xs text-muted-foreground">פורסם ברשומות: {formatDate(law.publicationDate)}</p>
              )}
              {law.topics.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {law.topics.map((t) => (
                    <li key={t}>
                      <TopicBadge label={t} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
