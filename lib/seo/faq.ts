// Shared FAQ shape. A page's visible FAQ section and its FAQPage JSON-LD render
// from the SAME array (declared in the page's *-jsonld.ts as `FaqItem[]`, then
// imported into both the JSON-LD object and the <Faq> component), so schema and
// copy can never diverge. The FAQPage object stays inline in the sibling module
// (literal `"@type": "FAQPage"`) — the SEO audit greps that token there.

export type FaqItem = { question: string; answer: string };
