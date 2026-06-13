/**
 * Canonical public Knesset bill page. Pattern verified by browser in the bill-pages
 * task (the page sits behind a Reblaze WAF, so it can't be curl-checked). Derived
 * from the stable BillID — never inferred per-bill.
 */
export function knessetBillUrl(billId: number): string {
  return `https://main.knesset.gov.il/Activity/Legislation/Laws/Pages/LawBill.aspx?t=lawsuggestionssearch&lawitemid=${billId}`;
}
