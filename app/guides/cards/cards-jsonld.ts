import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-jsonld";
import { SITE_AUTHOR, SITE_PUBLISHER, absUrl } from "@/lib/seo/site";
import { PAGES } from "@/lib/seo/related-pages";
import type { FaqItem } from "@/lib/seo/faq";

// Shared FAQ source: both the FAQPage JSON-LD (below) and the visible <Faq>
// section on the page render from this one array.
export const cardsFaqs: FaqItem[] = [
  {
    question: "מה הם קלפי הפוליטיקאים בפוליטיקל?",
    answer:
      "כל פוליטיקאי בפוליטיקל מיוצג בקלף קריקטורה: יצירה סאטירית על דמות ציבורית בתפקידה הציבורי. הקלפים נאספים לפי דיוק בתחזיות, לא בתשלום. אין להם ערך כספי.",
  },
  {
    question: "איך פותחים קלף של פוליטיקאי?",
    answer:
      "פותחים קלף בכך שצוברים מספר מסוים של תחזיות נכונות על השאלות של אותו פוליטיקאי. ההתקדמות לכל קלף נמדדת, והקלף נפתח אוטומטית ברגע שתחזית שנסגרה מעבירה אתכם את הסף של אותה דמות. אין דרך אחרת לפתוח קלף מלבד לצדוק בתחזיות.",
  },
  {
    question: "כמה תחזיות נכונות צריך כדי לפתוח קלף?",
    answer:
      "מספר התחזיות הנכונות שצריך תלוי בבכירות הדמות: ראש ממשלה מכהן דורש 10, ראש ממשלה לשעבר 7, יושב ראש מפלגה 5, שר 3, וחבר כנסת מן המניין 2. ככל שהדמות בכירה יותר, כך צריך יותר תחזיות נכונות כדי לפתוח את הקלף שלה.",
  },
  {
    question: "מה קובע את הנדירות של קלף?",
    answer:
      "לקלפים יש דרגות נדירות שתואמות את בכירות הדמות: אגדי, אפי, נדיר, לא שכיח ונפוץ. ככל שהדמות בכירה יותר, כך הקלף נדיר יותר וגם הסף לפתיחתו גבוה יותר.",
  },
  {
    question: "האם אפשר לקנות קלף?",
    answer:
      "לא. קלפים נפתחים רק בזכות תחזיות נכונות, ולעולם לא בתשלום. אין בפוליטיקל כסף אמיתי, לקלפים אין ערך כספי, והם אינם ניתנים להעברה למשתמש אחר.",
  },
  {
    question: "איפה רואים את אוסף הקלפים שלי?",
    answer:
      "האוסף שלכם מרכז את כל הקלפים שכבר פתחתם, לצד ההתקדמות שלכם לעבר קלפים שעדיין נעולים. לכל דמות רואים כמה תחזיות נכונות נותרו עד לפתיחת הקלף.",
  },
];

export const cardsArticleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: PAGES["/guides/cards"].title,
  description:
    "בפוליטיקל כל פוליטיקאי הוא קלף קריקטורה שנפתח לפי דיוק: מספר התחזיות הנכונות שצריך גדל לפי בכירות הדמות, מ-2 לחבר כנסת ועד 10 לראש ממשלה מכהן. אין כסף, אין קנייה.",
  datePublished: "2026-09-14",
  dateModified: "2026-09-14",
  author: SITE_AUTHOR,
  publisher: SITE_PUBLISHER,
  inLanguage: "he",
  mainEntityOfPage: { "@type": "WebPage", "@id": absUrl("/guides/cards") },
} as const;

export const cardsFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: cardsFaqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
} as const;

export const cardsBreadcrumbJsonLd = buildBreadcrumbJsonLd({
  trail: [
    { name: "מדריכים", path: "/site-index" },
    { name: "קלפי הפוליטיקאים", path: "/guides/cards" },
  ],
});
