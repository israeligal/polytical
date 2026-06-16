// Minimal inline icon set (no icon dependency). Line icons use currentColor; size via className.
type IconProps = { className?: string };

/** The Polytical mark: an interlaced Magen David — the YES up-triangle woven with the NO
 *  down-triangle. No badge; strokes ride the outcome tokens, so the star is techelet
 *  blue + red on the light theme and mint + coral on the dark one. */
export function PolyticalLogo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <path d="M60 10 L16.7 85 L103.3 85 Z" stroke="var(--positive)" strokeWidth="12.5" strokeLinejoin="round" fill="none" />
      <path d="M60 110 L103.3 35 L16.7 35 Z" stroke="var(--negative)" strokeWidth="12.5" strokeLinejoin="round" fill="none" />
      <path d="M50.6 26.3 L40.6 43.7 M83.9 51.3 L93.9 68.7 M35.6 85 L55.6 85" stroke="var(--positive)" strokeWidth="12.5" />
    </svg>
  );
}

export type Suit = "knesset" | "ballot" | "podium" | "mandate";

/** Faction crest (suit). Tints via currentColor; size via className. */
export function Crest({ suit = "knesset", className }: IconProps & { suit?: Suit }) {
  const inner = {
    knesset: (
      <g fill="currentColor">
        <rect x="6" y="9" width="36" height="4" rx="1" />
        <rect x="9" y="38" width="30" height="4" rx="1" />
        <rect x="10" y="15" width="4" height="22" />
        <rect x="18" y="15" width="4" height="22" />
        <rect x="26" y="15" width="4" height="22" />
        <rect x="34" y="15" width="4" height="22" />
        <path d="M24 4 L40 9 H8 Z" />
      </g>
    ),
    ballot: (
      <g fill="currentColor">
        <rect x="9" y="20" width="30" height="22" rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
        <rect x="18" y="14" width="12" height="4" rx="1" />
        <path d="M18 30 l4 4 l8 -9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
    podium: (
      <g fill="currentColor">
        <rect x="20" y="22" width="8" height="20" rx="2" />
        <path d="M12 42 H36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <rect x="15" y="14" width="18" height="9" rx="2" />
        <circle cx="24" cy="8" r="3" />
        <path d="M24 11 V14" stroke="currentColor" strokeWidth="2" />
      </g>
    ),
    mandate: (
      <g fill="currentColor">
        <path d="M12 20 v-6 a4 4 0 0 1 4-4 h16 a4 4 0 0 1 4 4 v6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <rect x="10" y="20" width="28" height="9" rx="3" />
        <rect x="13" y="29" width="4" height="11" rx="1" />
        <rect x="31" y="29" width="4" height="11" rx="1" />
      </g>
    ),
  }[suit];
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {inner}
    </svg>
  );
}

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
// Stature ladder gem fills: base slate · sapphire (minister) · bronze · silver · gold.
const RARITY_FILL: Record<Rarity, string> = {
  common: "#8A93B8", // base / slate
  uncommon: "#3F73E8", // sapphire / minister
  rare: "#E0A062", // bronze
  epic: "#C8D4E2", // silver
  legendary: "#FFC23D", // gold
};

/** Faceted rarity gem. Body color baked per tier; size via className. */
export function Gem({ rarity = "common", className }: IconProps & { rarity?: Rarity }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
      <path d="M24 4 L40 14 L40 34 L24 44 L8 34 L8 14 Z" fill={RARITY_FILL[rarity]} stroke="rgba(0,0,0,.3)" strokeWidth="1.5" />
      <path d="M24 4 L40 14 L24 22 L8 14 Z" fill="#FFFFFF" fillOpacity=".25" />
    </svg>
  );
}

/** Bell (notifications). Lucide-style line icon. */
export function Bell({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function X({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function Clock({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function Calendar({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </svg>
  );
}

export function Lock({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function Search({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** Hamburger — opens the mobile menu drawer. */
export function Menu({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

/** Close (X) — dismisses the mobile menu drawer. */
export function Close({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function Sun({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </svg>
  );
}

export function Moon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13.5A8 8 0 1 1 10.5 4a6.3 6.3 0 0 0 9.5 9.5Z" />
    </svg>
  );
}

export function Flame({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 2c.5 3-1.8 4.3-3.2 6C7.2 9.9 6 11.6 6 14a6 6 0 1 0 12 0c0-2-.8-3.6-2-5-.3 1-1 1.7-2 1.9.6-2.7-.4-5.6-2-8.9Z" />
    </svg>
  );
}

export function Trophy({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4v1a3 3 0 0 0 3 3M17 5h3v1a3 3 0 0 1-3 3M9 18h6M10 18v2.5M14 18v2.5M8 21h8" />
    </svg>
  );
}

export function Users({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.2a3.2 3.2 0 0 1 0 6.1M16.5 13.6A5.5 5.5 0 0 1 20.5 19" />
    </svg>
  );
}

export function ChatBubble({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16v11H9l-4 3.5V16H4Z" />
    </svg>
  );
}

export function Sparkle({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 2.5 13.8 9 20 11l-6.2 2L12 19l-1.8-6L4 11l6.2-2Z" />
    </svg>
  );
}

export function Ballot({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M8 10.5l2.2 2.2L15 8" />
    </svg>
  );
}

/** Reading-forward arrow with a shaft (points left, the RTL "continue" direction). */
export function ArrowForward({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

/** Reading-forward chevron (points left, the RTL "next" direction). */
export function ChevronForward({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 6l-6 6 6 6" />
    </svg>
  );
}

/** Google "G" — official 4-color brand mark (NOT currentColor). Size via className. */
export function Google({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

export function ArrowUpRight({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

export function Document({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}
