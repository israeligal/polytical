import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-jsonld";
import { SITE_AUTHOR, SITE_PUBLISHER, absUrl } from "@/lib/seo/site";
import { PAGES } from "@/lib/seo/related-pages";
import type { FaqItem } from "@/lib/seo/faq";

// Shared FAQ source: both the FAQPage JSON-LD (below) and the visible <Faq>
// section on the page render from this one array.
export const isItFreeFaqs: FaqItem[] = [
  {
    question: "האם פוליטיקל עולה כסף?",
    answer:
      "לא. פוליטיקל חינמי לגמרי. אין בו כסף אמיתי, פיקדונות או פרסים כספיים, ואיננו אוספים פרטי תשלום. הניקוד היחיד הוא מאזן הדיוק שלכם: כמה תחזיות צדקתם מתוך אלה שנסגרו.",
  },
  {
    question: "האם פוליטיקל זה הימורים?",
    answer:
      "לא. אין מה להמר: לא מסכנים כלום, אי אפשר להפסיד כסף או נקודות, ואין זכייה כספית. לפי תנאי השימוש זהו משחק תחזיות לבידור בלבד, לא פלטפורמת הימורים.",
  },
  {
    question: "אם אין כסף, מה מרוויחים בפוליטיקל?",
    answer:
      "הזכייה היחידה היא מאזן הדיוק שלכם וקלפי איסוף דיגיטליים. הקלפים נטולי ערך כספי ואינם ניתנים להעברה. אין קופה כספית, אין תשלום, ואי אפשר להמיר דבר לכסף.",
  },
  {
    question: "מגיל כמה מותר לשחק בפוליטיקל?",
    answer:
      "השימוש בפוליטיקל מותר מגיל 13 ומעלה. מכיוון שאין בו כסף, הימור או פרסים כספיים, זהו משחק ידע פתוח לכל מי שעוקב אחרי הפוליטיקה הישראלית.",
  },
  {
    question: "האם יש פרסומות או מכירת מידע אישי?",
    answer:
      "אין פרסומות ואיננו מוכרים מידע אישי. מעבר לחשבון ולפעילות שלכם בשירות, הנתון היחיד שנאסף הוא דיווחי שגיאה אנונימיים, ששימושם היחיד הוא לאתר ולתקן תקלות.",
  },
  {
    question: "במה פוליטיקל שונה מאתר הימורים?",
    answer:
      "באתר הימורים מפקידים כסף, מסכנים אותו על תוצאה, ויכולים לזכות או להפסיד סכומים. בפוליטיקל לא מסכנים דבר ואין זכייה כספית: החלוקה בכל שאלה היא ספירת המשתתפים שבחרו כל תוצאה, לא קופה ולא סיכוי מחושב. פוליטיקל גם אינו גוף סוקר, אינו שוק הון, ואינו נותן ייעוץ כלכלי או פוליטי.",
  },
];

export const isItFreeArticleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: PAGES["/guides/is-it-free"].title,
  description:
    "פוליטיקל חינמי לגמרי ואין בו כסף אמיתי, פיקדונות או פרסים כספיים. זה משחק תחזיות לבידור, לא הימור: לא מסכנים דבר ואי אפשר להפסיד כסף או נקודות. הניקוד היחיד הוא מאזן הדיוק.",
  datePublished: "2026-09-14",
  dateModified: "2026-09-14",
  author: SITE_AUTHOR,
  publisher: SITE_PUBLISHER,
  inLanguage: "he",
  mainEntityOfPage: { "@type": "WebPage", "@id": absUrl("/guides/is-it-free") },
} as const;

export const isItFreeFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: isItFreeFaqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
} as const;

export const isItFreeBreadcrumbJsonLd = buildBreadcrumbJsonLd({
  trail: [
    { name: "מדריכים", path: "/site-index" },
    { name: "האם פוליטיקל בחינם", path: "/guides/is-it-free" },
  ],
});
