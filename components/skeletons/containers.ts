// Shared layout constants — each route's page.tsx AND its skeleton import the
// SAME container/grid strings, so the two can't drift apart on the classes
// that define the page's shape (the failure mode behind every skeleton↔page
// mismatch found in the 2026-06-11 audit). Inner blocks may still evolve —
// the skeleton stories exist to make that drift visible — but width, padding
// and primary grids are locked by construction.

export const HOME_SECTION_INNER = "mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16";
export const VOTES_PAGE_CONTAINER = "mx-auto max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8";
export const VOTE_PAGE_CONTAINER = "mx-auto max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8";
export const MY_MATCH_CONTAINER = "mx-auto max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8";
export const POLITICIAN_CONTAINER = "mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8";
export const POLITICIAN_GRID = "grid gap-6 lg:grid-cols-[320px_1fr]";
export const MARKET_CONTAINER = "mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8";
export const MARKET_GRID = "grid gap-6 lg:grid-cols-[1fr_320px]";
export const PROFILE_CONTAINER = "mx-auto max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8";
export const POLITICIANS_CONTAINER = "mx-auto max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12";
export const POLITICIANS_GRID = "grid gap-5 sm:grid-cols-2 lg:grid-cols-3";
export const COLLECTION_CONTAINER = "mx-auto max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12";
export const NOTIFICATIONS_CONTAINER = "mx-auto max-w-2xl flex-1 px-4 py-8 sm:px-6 lg:px-8";
export const SEARCH_CONTAINER = "mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8";
