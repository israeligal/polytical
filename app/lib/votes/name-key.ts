import { normalizeSearchName } from "@/app/lib/knesset/search-name";

/**
 * Canonical, token-order-insensitive key for MK name matching.
 *
 * The website's VoteDetails.MkName is "Last First" ("אזולאי ינון") while
 * GetMksDropDown / OData names are "First Last" ("ינון אזולאי") — so the key
 * sorts tokens after running the same normalization as the discovery column
 * (niqqud/final-forms/particles via normalizeSearchName). BOTH sides of every
 * lookup — mk_name_mappings.nameKey and the incoming MkName — must pass
 * through this one function.
 *
 * This is a KEYING function, not fuzzy matching: attribution is exact-equality
 * on the key against the human-verified mapping. Two different persons whose
 * names collide to one key are detected at bootstrap and excluded from
 * auto-mapping — their votes always land in the review queue.
 */
export function nameKey(input: string): string {
  return normalizeSearchName(input).split(" ").filter(Boolean).sort().join(" ");
}
