import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-jsonld";
import { SITE_AUTHOR, SITE_PUBLISHER, absUrl } from "@/lib/seo/site";
import { PAGES } from "@/lib/seo/related-pages";
import type { FaqItem } from "@/lib/seo/faq";

// Shared FAQ source: both the FAQPage JSON-LD (below) and the visible <Faq>
// section on the page render from this one array.
export const knessetVotesFaqs: FaqItem[] = [
  {
    question: "מה זו הצבעת מליאה בכנסת?",
    answer:
      "הצבעת מליאה היא הצבעה שנערכת במליאת הכנסת, למשל על הצעת חוק, אמון בממשלה או הצעה לסדר. פוליטיקל מציג את הצבעות המליאה של הכנסת ה-25 כפי שהן נמשכות ישירות מהאתר הרשמי של הכנסת, עם קישור למקור בכל הצבעה.",
  },
  {
    question: "איפה רואים איך חבר כנסת מסוים הצביע?",
    answer:
      "בכל הצבעה מוצג מי הצביע בעד, נגד ונמנע, ומי לא הצביע או לא נכח. אפשר גם לפתוח את מאזן ההצבעה של חבר כנסת ולראות את ההצבעות שלו במקובץ. השיוך נעשה לפי מזהה יציב של הפוליטיקאי, לא לפי התאמת שם.",
  },
  {
    question: "מה ההבדל בין הצבעה שמית להצבעה אלקטרונית?",
    answer:
      "הצבעה שמית נרשמת שם-שם ולכן נושאת את הפירוט המלא של איך כל חבר כנסת הצביע. מבין כ-6,979 ההצבעות בכנסת ה-25, 458 הן הצבעות שמיות, ולצידן יש גם הצבעות אלקטרוניות. יחד הן מרכיבות את מאגר רשומות ההצבעה הפרטניות.",
  },
  {
    question: "מאיפה מגיעים נתוני ההצבעות?",
    answer:
      "כל הנתונים נמשכים ישירות מ-API של האתר הרשמי של הכנסת, ולכל הצבעה יש קישור למקור הרשמי. הנתונים מתרעננים אוטומטית לפי לוח זמנים. עובדה שאינה נמצאת מוצגת כ\"לא נמצא\" ולעולם לא מנוחשת.",
  },
  {
    question: "האם צריך חשבון כדי לראות הצבעות?",
    answer:
      "לא. אפשר לעיין בעמוד ההצבעות, לפתוח הצבעה בודדת או לראות את מאזן ההצבעה של חבר כנסת בלי להתחבר. חשבון נדרש רק לפעולות אחרות בפוליטיקל, לא כדי לצפות בהצבעות.",
  },
  {
    question: "האם אפשר לראות תיעוד היסטורי של הצבעות?",
    answer:
      "כן. פוליטיקל מציג את הצבעות המליאה של הכנסת ה-25, כולל הצבעות שכבר נערכו, כך שאפשר לעקוב אחרי הרשומה לאורך הקדנציה. הנתונים מתרעננים אוטומטית כדי לכלול הצבעות חדשות כשהן מתפרסמות.",
  },
];

export const knessetVotesArticleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: PAGES["/guides/knesset-votes"].title,
  description:
    "פוליטיקל מציג הצבעות מליאה אמיתיות של הכנסת ה-25, ישירות מהאתר הרשמי: מי הצביע בעד, נגד או נמנע בכל הצבעה, ומי לא הצביע, עם קישור למקור.",
  datePublished: "2026-09-14",
  dateModified: "2026-09-14",
  author: SITE_AUTHOR,
  publisher: SITE_PUBLISHER,
  inLanguage: "he",
  mainEntityOfPage: { "@type": "WebPage", "@id": absUrl("/guides/knesset-votes") },
} as const;

export const knessetVotesFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: knessetVotesFaqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
} as const;

export const knessetVotesBreadcrumbJsonLd = buildBreadcrumbJsonLd({
  trail: [
    { name: "מדריכים", path: "/site-index" },
    { name: "הצבעות חברי הכנסת", path: "/guides/knesset-votes" },
  ],
});
