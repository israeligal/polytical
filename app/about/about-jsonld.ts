import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-jsonld";
import { SITE_AUTHOR, SITE_PUBLISHER, absUrl } from "@/lib/seo/site";
import { PAGES } from "@/lib/seo/related-pages";
import type { FaqItem } from "@/lib/seo/faq";

// Shared FAQ source: both the FAQPage JSON-LD (below) and the visible <Faq>
// section on the page render from this one array.
export const aboutFaqs: FaqItem[] = [
  {
    question: "מה זה פוליטיקל?",
    answer:
      "פוליטיקל היא זירת תחזיות חינמית על הפוליטיקה הישראלית. בוחרים תוצאה בכל שאלה פוליטית פתוחה, וכשהשאלה נסגרת צוברים ניצחון אם צדקתם. אין כסף אמיתי, אין הימור, ואין נקודות שמפסידים.",
  },
  {
    question: "האם פוליטיקל עולה כסף?",
    answer:
      "לא. פוליטיקל חינמית לגמרי. אין בה כסף אמיתי, פיקדונות או פרסים כספיים. הניקוד היחיד הוא מאזן הדיוק שלכם: כמה תחזיות צדקתם מתוך אלה שנסגרו.",
  },
  {
    question: "מאיפה מגיעים הנתונים על הכנסת?",
    answer:
      "הצבעות המליאה נמשכות ישירות מהאתר הרשמי של הכנסת, כולל רשומות ההצבעה הפרטניות של חברי הכנסת ה-25. לכל הצבעה מוצג קישור למקור הרשמי.",
  },
  {
    question: "מה ההבדל בין פוליטיקל לבין סקר או הימור?",
    answer:
      "פוליטיקל אינה גוף סוקר ואינה זירת הימורים. אין בה כסף, והחלוקה בכל שאלה היא ספירת המשתתפים שבחרו כל תוצאה, לא סיכוי מהותי או קופה כספית. זה משחק ידע וקריאת מפה פוליטית.",
  },
  {
    question: "צריך חשבון כדי להשתמש?",
    answer:
      "אפשר לעיין בתחזיות ובהצבעות הכנסת בלי חשבון. כדי לתת מנדט (לבחור תוצאה), לצבור מאזן דיוק ולאסוף קלפים צריך להירשם, וההרשמה חינמית עם Google או אימייל.",
  },
  {
    question: "באיזו שפה פוליטיקל?",
    answer:
      "הממשק כולו בעברית ומיועד לכתיבה מימין לשמאל. זמנים מוצגים לפי אזור הזמן של ישראל (אסיה/ירושלים).",
  },
];

export const aboutArticleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: PAGES["/about"].title,
  description:
    "פוליטיקל היא זירת תחזיות חינמית על הפוליטיקה הישראלית: בוחרים תוצאה בכל שאלה, צוברים ניקוד לפי דיוק, ועוקבים אחרי הצבעות מליאה אמיתיות של הכנסת. בלי כסף אמיתי.",
  datePublished: "2026-09-14",
  dateModified: "2026-09-14",
  author: SITE_AUTHOR,
  publisher: SITE_PUBLISHER,
  inLanguage: "he",
  mainEntityOfPage: { "@type": "WebPage", "@id": absUrl("/about") },
} as const;

export const aboutFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: aboutFaqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
} as const;

export const aboutBreadcrumbJsonLd = buildBreadcrumbJsonLd({
  trail: [{ name: "אודות", path: "/about" }],
});
