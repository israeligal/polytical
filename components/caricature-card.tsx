import Link from "next/link";
import type { Politician } from "@/lib/types";
import { marketsForPolitician } from "@/lib/mock-data";
import { statureTierForPolitician, suitForCat, RARITY_HE, RARITY_TEXT, RARITY_BORDER } from "@/lib/rarity";
import { PoliticianPortrait } from "@/components/politician-portrait";
import { ChevronForward, Crest, Gem, Lock } from "@/components/icons";

/**
 * The collectible caricature card — the hero artifact of the product.
 *
 * `realData` flags a DB-backed MK (no mock markets exist for them): the footer
 * shows a neutral "קלף שחקן" badge instead of calling `marketsForPolitician`.
 * Mock-driven callers (homepage markets, market detail) omit it and keep the
 * live "X תחזיות פעילות" count — so existing behavior is untouched.
 *
 * `owned` (defaults true) drives the collection gallery: an un-owned card renders
 * dimmed + desaturated with a lock chip, so all existing call sites stay untouched.
 *
 * Click model: portrait, name, and the footer CTA all link to the politician
 * page. The CTA is the single keyboard/screen-reader link (portrait + name are
 * tabIndex={-1}) so each card costs one tab stop, not three. The politician
 * page renders its own card with `interactive={false}` — no self-links, no CTA.
 */
export function CaricatureCard({
  politician,
  realData = false,
  owned = true,
  interactive = true,
}: {
  politician: Politician;
  realData?: boolean;
  owned?: boolean;
  interactive?: boolean;
}) {
  const count = realData ? 0 : marketsForPolitician(politician.id).length;
  const href = `/politician/${politician.id}`;
  // Stature ladder: gold=sitting PM, silver=former PM, bronze=great office, base=MK.
  const rarity = statureTierForPolitician({ personId: Number(politician.id), role: politician.role });
  const suit = suitForCat(politician.cat);
  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-card border-[2.5px] bg-card shadow-3 ${RARITY_BORDER[rarity]} ${rarity === "legendary" && owned ? "shadow-glow-gold" : ""} ${owned ? "" : "opacity-65 grayscale"}`}
    >
      {!owned && (
        <span className="absolute end-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-background/85 px-2.5 py-1 font-accent text-[11px] font-extrabold text-muted-foreground backdrop-blur-sm">
          <Lock className="h-3.5 w-3.5" />
          לא נאסף
        </span>
      )}
      {/* rarity-tinted header: gem + tier on the start, faction crest on the end */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className={`inline-flex items-center gap-1.5 font-accent text-[11px] font-extrabold ${RARITY_TEXT[rarity]}`}>
          <Gem rarity={rarity} className="h-4 w-4" />
          {RARITY_HE[rarity]}
        </span>
        <span className={`grid h-7 w-7 place-items-center rounded-[9px] bg-foreground/10 ${RARITY_TEXT[rarity]}`}>
          <Crest suit={suit} className="h-[18px] w-[18px]" />
        </span>
      </div>

      <div className={interactive ? "px-4" : "px-4 pb-4"}>
        {interactive ? (
          <Link
            href={href}
            tabIndex={-1}
            aria-hidden="true"
            className="block transition duration-200 hover:brightness-105 active:scale-[.99]"
          >
            <PoliticianPortrait politician={politician} size="card" />
          </Link>
        ) : (
          <PoliticianPortrait politician={politician} size="card" />
        )}

        <h3 className="mt-3 font-display text-2xl leading-tight text-foreground">
          {interactive ? (
            <Link
              href={href}
              tabIndex={-1}
              className="transition-colors hover:text-primary"
            >
              {politician.name}
            </Link>
          ) : (
            politician.name
          )}
        </h3>
        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
          {politician.role}
          {politician.party ? ` · ${politician.party}` : ""}
        </p>
        {politician.tagline ? (
          <p className="mt-0.5 text-sm italic text-muted-foreground">
            {politician.tagline}
          </p>
        ) : null}

        <dl className="mt-3 divide-y divide-border overflow-hidden rounded-[12px] bg-sunken">
          {politician.facts.map((f) => (
            <div key={f.label} className="flex items-center justify-between px-3 py-1.5">
              <dt className="font-accent text-xs font-bold text-muted-foreground">{f.label}</dt>
              <dd className="nums text-sm font-bold text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {interactive && (
      <div className="mt-auto px-4 pb-4 pt-4">
        <Link
          href={href}
          className="group flex w-full items-center justify-center gap-2 rounded-[12px] bg-primary py-3 font-accent text-sm font-extrabold text-primary-foreground transition-all duration-150 hover:bg-primary-hover hover:shadow-glow-mint active:scale-[.99]"
        >
          <span>
            {realData ? (
              "לקלף השחקן"
            ) : (
              <>
                <span className="nums">{count}</span> תחזיות פעילות
              </>
            )}
          </span>
          <ChevronForward className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
        </Link>
      </div>
      )}
    </article>
  );
}
