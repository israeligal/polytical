import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-jsonld";
import { SITE_AUTHOR, SITE_PUBLISHER, absUrl } from "@/lib/seo/site";
import { PAGES } from "@/lib/seo/related-pages";
import type { FaqItem } from "@/lib/seo/faq";

// Shared FAQ source: both the FAQPage JSON-LD (below) and the visible <Faq>
// section on the page render from this one array.
export const whoIsItForFaqs: FaqItem[] = [
  {
    question: "למי מתאים פוליטיקל?",
    answer:
      "פוליטיקל מתאים למי שעוקב אחרי חדשות ופוליטיקה, מתווכח על מה יקרה ורוצה לבדוק לאורך זמן אם הוא קורא את המפה נכון. הוא מתאים גם למי שאוהב לאסוף ולהשוות, רוצה לראות איך חברי הכנסת באמת הצביעו, ומחפש משחק ידע ידידותי בלי כסף.",
  },
  {
    question: "למי פוליטיקל לא מתאים?",
    answer:
      "פוליטיקל לא מתאים למי שמחפש הימורים בכסף אמיתי או פרסים כספיים, כי אין כאן כסף בכלל. הוא גם לא מתאים למי שמחפש סקר מקצועי או תחזית בחירות רשמית, כי פוליטיקל הוא משחק ולא גוף סוקר. השימוש הוא מגיל 13 ומעלה.",
  },
  {
    question: "איך זה עובד בפועל?",
    answer:
      "אפשר לעיין בפוליטיקל בלי חשבון. כדי להשתתף נרשמים בחינם עם Google או אימייל, נותנים מנדט (בוחרים תוצאה) בשאלה, ואז עוקבים אחרי מאזן הדיוק ופותחים קלפים ועונות.",
  },
  {
    question: "מה מקבלים בפוליטיקל?",
    answer:
      "מקבלים דרך חינמית ובעברית לבדוק אם אתם קוראים את המפה הפוליטית נכון, כשהניקוד היחיד הוא דיוק. אפשר לראות איך חברי הכנסת באמת הצביעו, לאסוף ולהשוות קלפים, ולעקוב אחרי העונות. אין כאן כסף בכלל.",
  },
  {
    question: "האם צריך להיות מומחה לפוליטיקה?",
    answer:
      "לא. אין צורך להיות מומחה לפוליטיקה כדי להתחיל, ולומדים תוך כדי. מספיק שאתם עוקבים אחרי החדשות ורוצים לבדוק אם אתם קוראים את המפה נכון.",
  },
  {
    question: "האם פוליטיקל עולה כסף?",
    answer:
      "לא. פוליטיקל חינמי, וההרשמה חינמית עם Google או אימייל. אין כאן כסף בכלל, לא הימורים ולא פרסים כספיים, והניקוד היחיד הוא מאזן הדיוק.",
  },
];

export const whoIsItForArticleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: PAGES["/guides/who-is-it-for"].title,
  description:
    "פוליטיקל מתאים למי שעוקב אחרי חדשות ופוליטיקה, מתווכח על מה יקרה ורוצה לבדוק לאורך זמן אם הוא קורא את המפה נכון. לא מתאים למי שמחפש הימורים בכסף. חינם, עברית, והניקוד היחיד הוא דיוק.",
  datePublished: "2026-09-14",
  dateModified: "2026-09-14",
  author: SITE_AUTHOR,
  publisher: SITE_PUBLISHER,
  inLanguage: "he",
  mainEntityOfPage: { "@type": "WebPage", "@id": absUrl("/guides/who-is-it-for") },
} as const;

export const whoIsItForFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: whoIsItForFaqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
} as const;

export const whoIsItForBreadcrumbJsonLd = buildBreadcrumbJsonLd({
  trail: [
    { name: "מדריכים", path: "/site-index" },
    { name: "למי מתאים פוליטיקל", path: "/guides/who-is-it-for" },
  ],
});
