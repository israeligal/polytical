import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-jsonld";
import { SITE_AUTHOR, SITE_PUBLISHER, absUrl } from "@/lib/seo/site";
import { PAGES } from "@/lib/seo/related-pages";
import type { FaqItem } from "@/lib/seo/faq";

// Shared FAQ source: both the FAQPage JSON-LD and the visible <Faq> render from this array.
export const elections2026Faqs: FaqItem[] = [
  {
    question: "איך נותנים תחזית על הבחירות בפוליטיקל?",
    answer:
      "בוחרים שאלת תחזית פתוחה על הבחירות ובוחרים בה תוצאה אחת. אפשר לשנות את הבחירה עד שהשאלה נסגרת. כשהשאלה נסגרת מול התוצאה הרשמית, בחירה נכונה מעלה את מאזן הדיוק שלכם.",
  },
  {
    question: "על מה אפשר לתת תחזית לקראת הבחירות?",
    answer:
      "על תוצאות כמו איזו מפלגה תוביל, אילו מפלגות יעברו את אחוז החסימה, אילו קואליציות ייתכנו, ומי יתבקש להרכיב ממשלה. אלה שאלות על תוצאות עתידיות, ולא קביעה של פוליטיקל מה יקרה.",
  },
  {
    question: "האם פוליטיקל מפרסמת תחזית מי ינצח?",
    answer:
      "לא. פוליטיקל אינה גוף סוקר ואינה מפרסמת תחזית משלה. החלוקה שמוצגת בכל שאלה היא רק ספירת המשתתפים שבחרו כל תוצאה, לא סקר מדגמי ולא סיכוי מחושב.",
  },
  {
    question: "מתי מתקיימות הבחירות?",
    answer:
      "כל תאריך רשמי מגיע ממקורות רשמיים בלבד, ופוליטיקל אינה מכריזה על תאריך משלה. שאלות התחזית נפתחות לקראת הבחירות הקרובות, ונסגרות מול התוצאה הרשמית כשהיא מתפרסמת.",
  },
  {
    question: "האם זה סקר או הימור?",
    answer:
      "אף אחד מהם. פוליטיקל אינה זירת הימורים ואינה גוף סוקר. אין בה כסף אמיתי, פיקדונות או פרסים כספיים, והניקוד היחיד הוא מאזן הדיוק שלכם.",
  },
  {
    question: "איך משתפים תחזית בחירות עם חברים?",
    answer:
      "אפשר לאתגר חבר בדו-קרב על שאלת בחירות אחת דרך קישור: כל אחד בוחר תוצאה, ומי שצדק כשהשאלה נסגרת מנצח. אפשר גם לתת תחזיות יחד בתוך קואליציה, מועדון תחזיות פרטי עם טבלת מובילים משלכם.",
  },
  {
    question: "מאיפה מגיעות התוצאות?",
    answer:
      "כל התאריכים והתוצאות מגיעים ממקורות רשמיים בלבד, ולעולם לא מניחוש. פוליטיקל גם מציגה הצבעות מליאה אמיתיות של הכנסת ישירות מהאתר הרשמי, עם קישור למקור.",
  },
];

export const elections2026ArticleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: PAGES["/guides/elections-2026"].title,
  description:
    "לקראת הבחירות הקרובות פוליטיקל פותחת שאלות תחזית על התוצאות: מי יוביל, אילו מפלגות יעברו את אחוז החסימה, ואיזו קואליציה תיתכן. פוליטיקל אינה מפרסמת תחזית משלה, ואין בה כסף אמיתי.",
  datePublished: "2026-09-14",
  dateModified: "2026-09-14",
  author: SITE_AUTHOR,
  publisher: SITE_PUBLISHER,
  inLanguage: "he",
  mainEntityOfPage: { "@type": "WebPage", "@id": absUrl("/guides/elections-2026") },
} as const;

export const elections2026FaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: elections2026Faqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
} as const;

export const elections2026BreadcrumbJsonLd = buildBreadcrumbJsonLd({
  trail: [{ name: "תחזיות לבחירות 2026", path: "/guides/elections-2026" }],
});
