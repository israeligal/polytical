import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-jsonld";
import { SITE_AUTHOR, SITE_PUBLISHER, absUrl } from "@/lib/seo/site";
import { PAGES } from "@/lib/seo/related-pages";
import type { FaqItem } from "@/lib/seo/faq";

// Shared FAQ source for both the FAQPage JSON-LD and the visible <Faq> section.
export const duelsFaqs: FaqItem[] = [
  {
    question: "מה זה דו-קרב בפוליטיקל?",
    answer:
      "דו-קרב הוא תחזית ראש בראש על שאלה אחת. יוצרים קישור אתגר שאפשר לשתף, שולחים אותו לחבר, כל צד בוחר תוצאה, ומי שצדק כשהשאלה נסגרת מנצח בדו-קרב. זה בשביל כבוד בלבד, בלי כסף ובלי פרסים.",
  },
  {
    question: "איך מזמינים חבר לדו-קרב?",
    answer:
      "יוצרים קישור אתגר לשאלה ושולחים אותו לחבר בכל דרך שנוחה לכם. החבר פשוט פותח את הקישור ובוחר את התוצאה שלו. כדי ליצור דו-קרב צריך להיות מחוברים, אבל החבר לא חייב חשבון כדי לענות דרך הקישור.",
  },
  {
    question: "על אילו שאלות אפשר לפתוח דו-קרב?",
    answer:
      "דו-קרב רץ על שאלות שנסגרות בקרוב, בזירה הארצית בלבד. אי אפשר לפתוח דו-קרב בתוך קואליציה פרטית. כל צד בוחר תוצאה אחת לאותה שאלה.",
  },
  {
    question: "איך נקבע מי ניצח בדו-קרב?",
    answer:
      "כל צד בוחר תוצאה אחת לשאלה. כשהשאלה נסגרת, מי שבחר את התוצאה הנכונה מנצח בדו-קרב. אין כאן ניקוד כספי, רק מי צדק ומי טעה.",
  },
  {
    question: "אפשר ריצ׳מטש אחרי שהדו-קרב נגמר?",
    answer:
      "כן. אחרי שהדו-קרב מוכרע אפשר לפתוח ריצ׳מטש מול אותו חבר על שאלה חדשה, וגם לשתף את התוצאה. ככה ממשיכים את התחרות סבב אחרי סבב.",
  },
  {
    question: "צריך חשבון כדי לשחק דו-קרב?",
    answer:
      "כדי ליצור דו-קרב ולשלוח קישור אתגר צריך להיות מחוברים. הצד שמקבל את הקישור פשוט פותח אותו ובוחר תוצאה. ההרשמה חינמית ופותחת גם פעולות נוספות בפוליטיקל.",
  },
  {
    question: "יש כסף או פרסים בדו-קרב?",
    answer:
      "לא. דו-קרב הוא בשביל כבוד בלבד. אין בו כסף אמיתי, אין הימור ואין פרסים כספיים.",
  },
];

export const duelsArticleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: PAGES["/guides/duels"].title,
  description:
    "דו-קרב בפוליטיקל הוא תחזית ראש בראש על שאלה אחת: יוצרים קישור אתגר, שולחים לחבר, כל צד בוחר תוצאה, ומי שצדק כשהשאלה נסגרת מנצח. בשביל כבוד בלבד, בלי כסף.",
  datePublished: "2026-09-14",
  dateModified: "2026-09-14",
  author: SITE_AUTHOR,
  publisher: SITE_PUBLISHER,
  inLanguage: "he",
  mainEntityOfPage: { "@type": "WebPage", "@id": absUrl("/guides/duels") },
} as const;

export const duelsFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: duelsFaqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
} as const;

export const duelsBreadcrumbJsonLd = buildBreadcrumbJsonLd({
  trail: [
    { name: "מדריכים", path: "/site-index" },
    { name: "דו-קרב תחזיות", path: "/guides/duels" },
  ],
});
