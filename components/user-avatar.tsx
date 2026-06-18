import Image from "next/image";
import { FALLBACK_HANDLE } from "@/app/lib/onboarding/handle";

/**
 * The one avatar used everywhere a user's identity appears (header, profile,
 * comments, leaderboard, group rosters). Renders the user's caricature if they
 * have one, else a colored circle with the first letter of their public
 * @-handle. Always decorative (`aria-hidden`): the adjacent handle text carries
 * the identity, and per AGENTS.md the initial is derived from `handle` (coalesced
 * to FALLBACK_HANDLE) — NEVER the real `name`.
 */
type Size = "xs" | "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  xs: "h-7 w-7 text-xs", // dense group lists (roster, scoreboard, vote-stances)
  sm: "h-9 w-9 text-sm", // comments, leaderboard
  md: "h-10 w-10 text-base", // header
  lg: "h-14 w-14 text-2xl", // profile
};
const IMG_SIZES: Record<Size, string> = { xs: "28px", sm: "36px", md: "40px", lg: "56px" };

export function UserAvatar({
  caricatureUrl,
  handle,
  size = "md",
  className = "",
}: {
  caricatureUrl?: string | null;
  handle?: string | null;
  size?: Size;
  className?: string;
}) {
  const base = `relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-bold text-foreground ring-1 ring-border ${SIZE[size]} ${className}`;

  if (caricatureUrl) {
    return (
      <span aria-hidden="true" className={base}>
        <Image src={caricatureUrl} alt="" fill sizes={IMG_SIZES[size]} className="object-cover" />
      </span>
    );
  }

  // leading-none: the font's tall line box otherwise floats the glyph off-center.
  const initial = (handle ?? FALLBACK_HANDLE).trim().charAt(0).toUpperCase() || "?";
  return (
    <span aria-hidden="true" className={base}>
      <span className="leading-none">{initial}</span>
    </span>
  );
}
