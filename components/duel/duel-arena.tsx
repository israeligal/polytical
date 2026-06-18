"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";
import type { CatColor, Market, Outcome } from "@/lib/types";
import { catBorder, catText } from "@/lib/cat";
import { CategoryBadge } from "@/components/badges";
import { ArenaBackdrop } from "@/components/duel/arena-backdrop";
import { VsBand, type BandPick } from "@/components/duel/vs-band";
import { DuelOutcomeButton } from "@/components/duel/duel-outcome-button";
import { CountUp, PlayerAvatar, UrgencyChip } from "@/components/duel/duel-atoms";
import type { DuelArenaProps, OutcomeTone } from "@/components/duel/types";

function outcomeTone(market: Market, outcome: Outcome, index: number): OutcomeTone {
  const isBinary = market.type === "binary" || market.outcomes.length === 2;
  if (isBinary) return index === 0 ? { kind: "positive" } : { kind: "negative" };
  const color = (outcome.color ?? (((index % 8) + 1) as CatColor)) as CatColor;
  return { kind: "cat", color };
}

function bandToneClass(tone: OutcomeTone): string {
  if (tone.kind === "positive") return "text-positive border-positive/40 bg-positive-soft";
  if (tone.kind === "negative") return "text-negative border-negative/40 bg-negative-soft";
  return `${catText[tone.color]} ${catBorder[tone.color]} bg-card`;
}

/**
 * The duel arena — the full-bleed, motion-rich landing a friend opens from a
 * shared link. One question, a head-to-head VS face-off, two (or more) tactile
 * sides; picking reveals the crowd split + the challenger's pick and unlocks a
 * re-share hook. Self-themed dark "trading floor" for cinematic glow.
 */
export function DuelArena({
  market,
  challenger,
  you,
  crowd = [],
  myPickId = null,
  isLoggedIn = false,
  loginHref = "/login",
  shareUrl,
  onPick,
}: DuelArenaProps) {
  const reduce = useReducedMotion();
  const [pickedId, setPickedId] = useState<string | null>(myPickId);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const revealed = pickedId != null;

  const total = useMemo(() => market.outcomes.reduce((s, o) => s + o.predictors, 0), [market.outcomes]);
  const isBinary = market.type === "binary" || market.outcomes.length === 2;

  const tones = useMemo(
    () => new Map(market.outcomes.map((o, i) => [o.id, outcomeTone(market, o, i)] as const)),
    [market],
  );
  const labelOf = (id?: string | null) => market.outcomes.find((o) => o.id === id)?.label ?? "";
  const bandPick = (id?: string | null): BandPick | undefined => {
    if (!id) return undefined;
    const tone = tones.get(id);
    return tone ? { label: labelOf(id), toneClassName: bandToneClass(tone) } : undefined;
  };

  function handlePick(outcomeId: string) {
    if (pickedId === outcomeId) return;
    setPickedId(outcomeId); // optimistic → triggers the reveal
    startTransition(async () => {
      try {
        await onPick?.(outcomeId);
      } catch {
        /* real wiring surfaces errors; demo keeps the optimistic reveal */
      }
    });
  }

  async function handleShare() {
    const url = shareUrl ?? (typeof window !== "undefined" ? window.location.href : "");
    const text = `@${challenger.handle.replace(/^@/, "")} מאתגר/ת אותך: ${market.question}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "פוליטיקל · דו-קרב", text, url });
      } catch {
        /* user dismissed the sheet */
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard && url) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Per-element staggered entrance. Transform-only (no opacity gate): if the
  // enter animation never runs — backgrounded tab with rAF throttled, reduced
  // motion, a JS hiccup — content stays fully visible (just un-slid) instead of
  // invisible. Explicit delays beat parent `staggerChildren` here because each
  // section carries its own nested independent animations.
  const reveal = (i: number) => ({
    initial: { y: reduce ? 0 : 16 },
    animate: { y: 0 },
    transition: { type: "spring" as const, stiffness: 260, damping: 24, delay: 0.04 + i * 0.07 },
  });

  return (
    <div
      data-theme="dark"
      dir="rtl"
      className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground"
    >
      <ArenaBackdrop />

      <div className="flex w-full max-w-md flex-col items-stretch gap-5">
        {/* kicker */}
        <motion.div {...reveal(0)} className="flex items-center justify-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-text-low">
          <motion.span
            className="inline-block h-2 w-2 rounded-full bg-primary shadow-glow-mint"
            animate={reduce ? undefined : { opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
          פוליטיקל · זירה
        </motion.div>

        {/* the hail */}
        <motion.h1 {...reveal(1)} className="text-center font-display text-2xl leading-tight sm:text-3xl">
          <bdi className="text-accent">@{challenger.handle.replace(/^@/, "")}</bdi>{" "}
          <span className="text-foreground">מאתגר/ת אותך</span> <span className="align-middle">🥊</span>
        </motion.h1>

        {/* VS face-off */}
        <motion.div {...reveal(2)}>
          <VsBand
            challengerHandle={challenger.handle}
            challengerAvatar={challenger.caricatureUrl}
            challengerPick={bandPick(challenger.pickedOutcomeId)}
            youHandle={you?.handle}
            youAvatar={you?.caricatureUrl}
            youPick={bandPick(pickedId)}
            revealed={revealed}
            agree={revealed && !!challenger.pickedOutcomeId && challenger.pickedOutcomeId === pickedId}
          />
        </motion.div>

        {/* the one question */}
        <motion.div
          {...reveal(3)}
          className="relative overflow-hidden rounded-card border border-border bg-card p-5 shadow-2"
        >
          {!reduce && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -inset-x-1/2 skew-x-[-18deg]"
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)" }}
              initial={{ x: "-120%" }}
              animate={{ x: "120%" }}
              transition={{ duration: 1.1, ease: "easeOut", delay: 0.5, repeat: Infinity, repeatDelay: 5 }}
            />
          )}
          <div className="relative mb-3 flex items-center justify-between gap-2">
            <CategoryBadge category={market.category} />
            <UrgencyChip closeAt={market.closeAt} />
          </div>
          <h2 className="relative font-display text-xl leading-snug sm:text-[26px]">{market.question}</h2>
        </motion.div>

        {/* the sides */}
        <motion.div {...reveal(4)} className={isBinary ? "grid grid-cols-2 gap-3" : "flex flex-col gap-2.5"}>
          {(isBinary ? market.outcomes : [...market.outcomes].sort((a, b) => b.predictors - a.predictors)).map(
            (o) => (
              <DuelOutcomeButton
                key={o.id}
                label={o.label}
                predictors={o.predictors}
                total={total}
                tone={tones.get(o.id)!}
                picked={pickedId === o.id}
                revealed={revealed}
                disabled={pending}
                onPick={() => handlePick(o.id)}
              />
            ),
          )}
        </motion.div>

        {/* reveal status + share hook */}
        <AnimatePresence mode="wait" initial={false}>
          {revealed ? (
            <motion.div
              key="revealed"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 text-center"
            >
              <p className="text-sm font-extrabold text-positive">
                המנדט שלך נרשם! מי צודק? נגלה כשהשוק ייסגר.
              </p>
              {isLoggedIn ? (
                <ShareButton onShare={handleShare} copied={copied} label="אתגרו עוד חברים" primary />
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    כדי לשמור את המנדט ולראות מי ניצח — צריך חשבון. זה לוקח שנייה.
                  </p>
                  <Link
                    href={loginHref}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-extrabold text-primary-foreground shadow-glow-mint transition-colors hover:bg-primary-hover"
                  >
                    הצטרפו ושמרו את המנדט ←
                  </Link>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div key="prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
              <p className="text-sm font-bold text-muted-foreground">מה דעתך? בחר/י צד כדי לראות מי עוד ניבא</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* one-to-many social proof */}
        {crowd.length > 0 && (
          <motion.div {...reveal(6)} className="flex items-center justify-center gap-3">
            <div className="flex">
              {crowd.slice(0, 5).map((p, i) => (
                <span key={p.handle + i} className="-ms-3 rounded-full ring-2 ring-background first:ms-0">
                  <PlayerAvatar handle={p.handle} caricatureUrl={p.caricatureUrl} size={32} ringClassName="ring-border" />
                </span>
              ))}
            </div>
            <span className="text-sm font-bold text-muted-foreground">
              <CountUp to={crowd.length} duration={0.9} className="font-black text-gold" /> חברים כבר ניבאו
            </span>
          </motion.div>
        )}

        {/* brand footer / acquisition tail */}
        <motion.p {...reveal(7)} className="text-center text-[11px] text-text-low">
          פוליטיקל — מנבאים את הפוליטיקה הישראלית, יחד.
        </motion.p>
      </div>
    </div>
  );
}

function ShareButton({
  onShare,
  copied,
  label,
  primary,
}: {
  onShare: () => void;
  copied: boolean;
  label: string;
  primary?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onShare}
      whileHover={reduce ? undefined : { scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-extrabold shadow-glow-mint transition-colors ${
        primary ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border-2 border-primary text-primary"
      }`}
    >
      <span aria-hidden>🔗</span>
      {copied ? "הקישור הועתק!" : label}
    </motion.button>
  );
}
