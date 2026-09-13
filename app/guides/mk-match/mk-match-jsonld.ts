import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-jsonld";
import { SITE_AUTHOR, SITE_PUBLISHER, absUrl } from "@/lib/seo/site";
import { PAGES } from "@/lib/seo/related-pages";
import type { FaqItem } from "@/lib/seo/faq";

// Shared FAQ source: both the FAQPage JSON-LD (below) and the visible <Faq>
// section on the page render from this one array.
export const mkMatchFaqs: FaqItem[] = [
  {
    question: "איך פוליטיקל יודע איזה חבר כנסת מצביע כמוני?",
    answer:
      "מביעים עמדה, בעד או נגד, על הצבעות מליאה אמיתיות של הכנסת ה-25, ופוליטיקל משווה את העמדות שלכם לרשומות ההצבעה הרשמיות של חברי הכנסת. חבר הכנסת שהצביע כמוכם בהכי הרבה הצבעות הוא ההתאמה הקרובה ביותר. הכול מבוסס על ההצבעות בפועל, לא על הצהרות או סקרים.",
  },
  {
    question: "על אילו הצבעות אפשר להביע עמדה?",
    answer:
      "מביעים עמדה על הצבעות מליאה אמיתיות שנערכו בכנסת ה-25, כפי שהן נמשכות מהאתר הרשמי של הכנסת. לכל הצבעה בוחרים בעד או נגד, בדיוק כמו שחבר כנסת מצביע במליאה.",
  },
  {
    question: "איך מחושבת ההתאמה בין העמדות שלי לחברי הכנסת?",
    answer:
      "ההתאמה מבוססת על מזהה יציב של הפוליטיקאי ועל רשומות ההצבעה הרשמיות, ולא על התאמת שם בעברית. פוליטיקל סופר בכמה הצבעות עמדתכם תואמת לזו של כל חבר כנסת ומדרג את הקרובים אליכם. נתון הצבעה חסר לעולם לא מנוחש.",
  },
  {
    question: "האם העמדות שלי חשופות למישהו?",
    answer:
      "העמדות שלכם פרטיות כברירת מחדל ומוצגות רק לכם. על כל הצבעה מוצג אחוז מצטבר אנונימי רק אחרי שלפחות 10 משתמשים הביעו עליה עמדה, בלי לחשוף מי הצביע מה. בתוך קואליציה פרטית אתם יכולים לבחור לשתף את העמדות שלכם עם החברים.",
  },
  {
    question: "מאיפה מגיעים נתוני ההצבעות?",
    answer:
      "כל רשומות ההצבעה נמשכות ישירות מהאתר הרשמי של הכנסת, כולל האופן שבו כל חבר כנסת הצביע בכל הצבעה שמית. השיוך נעשה לפי מזהה יציב של הפוליטיקאי, ועובדה שאינה נמצאת מוצגת במפורש ולעולם לא מנוחשת.",
  },
  {
    question: "צריך חשבון כדי לגלות את ההתאמה שלי?",
    answer:
      "כדי להביע עמדה על הצבעות ולפתוח את ההתאמה האישית צריך חשבון, וההרשמה חינמית עם Google או אימייל. אין כסף אמיתי בפוליטיקל, והשירות חינם לגמרי.",
  },
  {
    question: "כמה הצבעות צריך כדי לפתוח את ההתאמה?",
    answer:
      "את ההתאמה האישית פותחים אחרי שהבעתם עמדה על מספר הצבעות שניתן לנקד. ככל שמביעים עמדה על יותר הצבעות, ההתאמה מתחדדת ומשקפת טוב יותר את הקו שלכם.",
  },
];

export const mkMatchArticleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: PAGES["/guides/mk-match"].title,
  description:
    "מביעים עמדה על הצבעות מליאה אמיתיות של הכנסת ה-25, ופוליטיקל מחשב איזה חבר כנסת הכי קרוב לעמדות שלכם, לפי רשומות ההצבעה הרשמיות. העמדות פרטיות כברירת מחדל, וחינם.",
  datePublished: "2026-09-14",
  dateModified: "2026-09-14",
  author: SITE_AUTHOR,
  publisher: SITE_PUBLISHER,
  inLanguage: "he",
  mainEntityOfPage: { "@type": "WebPage", "@id": absUrl("/guides/mk-match") },
} as const;

export const mkMatchFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: mkMatchFaqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
} as const;

export const mkMatchBreadcrumbJsonLd = buildBreadcrumbJsonLd({
  trail: [
    { name: "מדריכים", path: "/site-index" },
    { name: "איזה חבר כנסת מצביע כמוני", path: "/guides/mk-match" },
  ],
});
