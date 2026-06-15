// Group name + icon display helpers. The coalition's emoji now lives inside the
// name itself (see group-create-form), but older groups stored it separately in
// `emblem`. These helpers render the icon exactly once across both shapes.

// A leading emoji: a pictograph (+ optional ZWJ sequence and variation
// selector ️) or a two-char flag (regional indicators), anchored at start.
const LEADING_EMOJI_RE =
  /^(?:\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*️?|\p{Regional_Indicator}{2})/u;

interface GroupLike {
  nameHe: string;
  emblem: string | null;
}

export function leadingEmoji(name: string): string | null {
  return name.match(LEADING_EMOJI_RE)?.[0] ?? null;
}

/** The standalone avatar glyph: the name's leading emoji, else the stored
 *  emblem, else a neutral default. */
export function groupIcon({ nameHe, emblem }: GroupLike): string {
  return leadingEmoji(nameHe) ?? emblem ?? "🏛️";
}

/** The name with any leading emoji removed — for use beside a separate icon. */
export function groupTextOnly({ nameHe }: Pick<GroupLike, "nameHe">): string {
  const lead = leadingEmoji(nameHe);
  return lead ? nameHe.slice(lead.length).trimStart() : nameHe;
}

/** Inline "icon + name" as one string, with the icon appearing exactly once
 *  (handles new names that already start with an emoji and old emblem-only ones). */
export function groupLabel({ nameHe, emblem }: GroupLike): string {
  if (leadingEmoji(nameHe)) return nameHe;
  return emblem ? `${emblem} ${nameHe}` : nameHe;
}
