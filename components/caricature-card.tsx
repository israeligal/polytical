import Link from "next/link";
import type { Politician } from "@/lib/types";
import { marketsForPolitician } from "@/lib/mock-data";
import { catBg, catBorder, catText, catTint } from "@/lib/cat";
import { PoliticianPortrait } from "@/components/politician-portrait";
import { ChevronForward } from "@/components/icons";

/**
 * The collectible caricature card — the hero artifact of the product.
 *
 * `realData` flags a DB-backed MK (no mock markets exist for them): the footer
 * shows a neutral "קלף שחקן" badge instead of calling `marketsForPolitician`.
 * Mock-driven callers (homepage markets, market detail) omit it and keep the
 * live "X שווקים פעילים" count — so existing behavior is untouched.
 */
export function CaricatureCard({
  politician,
  realData = false,
}: {
  politician: Politician;
  realData?: boolean;
}) {
  const count = realData ? 0 : marketsForPolitician(politician.id).length;
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border-2 bg-card shadow-lg ${catBorder[politician.cat]}`}
    >
      <div className={`h-1.5 w-full ${catBg[politician.cat]}`} />

      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${catTint[politician.cat]} ${catText[politician.cat]}`}
          >
            {politician.party}
          </span>
          <span className="text-xs text-muted-foreground">{politician.role}</span>
        </div>

        <PoliticianPortrait politician={politician} size="card" />

        <h3 className="mt-3 font-display text-2xl font-black leading-tight text-foreground">
          {politician.name}
        </h3>
        {politician.tagline ? (
          <p className="mt-0.5 text-sm italic text-muted-foreground">
            {politician.tagline}
          </p>
        ) : null}

        <dl className="mt-3 divide-y divide-border rounded-lg bg-muted/60 px-3">
          {politician.facts.map((f) => (
            <div key={f.label} className="flex items-center justify-between py-1.5">
              <dt className="text-sm text-muted-foreground">{f.label}</dt>
              <dd className="nums text-sm font-bold text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Link
        href={`/politician/${politician.id}`}
        className={`mt-auto flex items-center justify-between px-4 py-3 text-sm font-bold transition-opacity hover:opacity-80 ${catTint[politician.cat]} ${catText[politician.cat]}`}
      >
        <span>
          {realData ? (
            "קלף שחקן"
          ) : (
            <>
              <span className="nums">{count}</span> שווקים פעילים
            </>
          )}
        </span>
        <ChevronForward className="h-4 w-4" />
      </Link>
    </article>
  );
}
