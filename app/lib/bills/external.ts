/**
 * Canonical public Knesset bill page. The modern SPA route, verified live in a real
 * browser 2026-06-13 (BillID 2243802 → the matching bill): the legacy
 * `…/LawBill.aspx?t=lawsuggestionssearch&lawitemid=<id>` URL 301-redirects here, so we
 * target the canonical form directly (fewer hops). The page sits behind a Reblaze WAF,
 * so it can't be curl-checked — real browsers pass fine. Derived from the stable
 * BillID — never inferred per-bill.
 */
export function knessetBillUrl(billId: number): string {
  return `https://main.knesset.gov.il/apps/legislation/main/bills/${billId}`;
}
