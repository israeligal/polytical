import type { ReactElement } from "react";

// Generic JSON-LD script tag. Accepts any schema.org payload (Article, FAQPage,
// BreadcrumbList, Organization, ...). Render one per schema at the end of a page.
export function JsonLd({ payload }: { payload: Record<string, unknown> }): ReactElement {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}
