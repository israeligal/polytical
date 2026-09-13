import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-jsonld";
import { SITE_AUTHOR, SITE_PUBLISHER, absUrl } from "@/lib/seo/site";
import { PAGES } from "@/lib/seo/related-pages";
import type { FaqItem } from "@/lib/seo/faq";

// Shared FAQ source: both the FAQPage JSON-LD (below) and the visible <Faq>
// section on the page render from this one array.
export const coalitionsFaqs: FaqItem[] = [
  {
    question: "מה זו קואליציה בפוליטיקל?",
    answer:
      "קואליציה בפוליטיקל היא מועדון תחזיות פרטי בהזמנה בלבד, קבוצה סגורה בין חברים שמתחרים על דיוק תחזיות. לכל קואליציה יש טבלת מובילים משלה, הצעות לסדר משלה ומליאה (דיון) נפרדת לכל שאלה. זו קבוצה בין חברים, לא הקואליציה הפוליטית שמרכיבה ממשלה.",
  },
  {
    question: "במה קבוצה שונה מהזירה הארצית?",
    answer:
      "התוצאות בקואליציה מבודדות לגמרי מהזירה הארצית. כשמתפרסמת שאלה קבוצתית ונסגרת, היא מעדכנת רק את המונים של חברי הקבוצה, ולעולם לא את מאזן הדיוק הארצי שלכם, את הקלפים או את העונות.",
  },
  {
    question: "איך מצטרפים לקואליציה?",
    answer:
      "מצטרפים דרך קישור הזמנה או קוד שקיבלתם מחבר בקבוצה. אחרי ההצטרפות בוחרים את הקואליציה הפעילה מכותרת האתר, ופיד התחזיות מצטמצם לאותה קבוצה. ניהול הקואליציה, כמו רשימת החברים וההזמנות, נמצא בעמוד ייעודי משלו.",
  },
  {
    question: "האם אפשר לשתף עמדות בתוך הקבוצה?",
    answer:
      "כן, בבחירה. חברים יכולים לבחור לשתף בתוך הקבוצה את העמדות שלהם על הצבעות הכנסת כדי להשוות ביניהן. השיתוף הדדי וניתן לביטול בכל רגע.",
  },
  {
    question: "האם קואליציה עולה כסף?",
    answer:
      "לא. קואליציות בפוליטיקל חינמיות לגמרי, בדיוק כמו כל שאר האתר. אין כסף אמיתי, אין פיקדונות ואין פרסים כספיים.",
  },
];

export const coalitionsArticleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: PAGES["/guides/coalitions"].title,
  description:
    "קואליציה בפוליטיקל היא מועדון תחזיות פרטי בהזמנה בלבד: טבלת מובילים נפרדת, הצעות לסדר משלכם ומליאה קבוצתית, בנפרד מהזירה הארצית. חינם, בלי כסף אמיתי.",
  datePublished: "2026-09-14",
  dateModified: "2026-09-14",
  author: SITE_AUTHOR,
  publisher: SITE_PUBLISHER,
  inLanguage: "he",
  mainEntityOfPage: { "@type": "WebPage", "@id": absUrl("/guides/coalitions") },
} as const;

export const coalitionsFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: coalitionsFaqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
} as const;

export const coalitionsBreadcrumbJsonLd = buildBreadcrumbJsonLd({
  trail: [
    { name: "מדריכים", path: "/site-index" },
    { name: "קואליציות", path: "/guides/coalitions" },
  ],
});
