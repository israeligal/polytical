import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-jsonld";
import { SITE_AUTHOR, SITE_PUBLISHER, absUrl } from "@/lib/seo/site";
import { PAGES } from "@/lib/seo/related-pages";
import type { FaqItem } from "@/lib/seo/faq";

// Shared FAQ source: both the FAQPage JSON-LD (below) and the visible <Faq>
// section on the page render from this one array.
export const howItWorksFaqs: FaqItem[] = [
  {
    question: "מה זו תחזית (מנדט) בפוליטיקל?",
    answer:
      "תחזית היא בחירה של תוצאה אחת מתוך התוצאות האפשריות של שאלה פוליטית. בוחרים את מה שאתם חושבים שיקרה, בלי סכום ובלי הימור. יש תחזית אחת לכל שאלה לכל משתמש.",
  },
  {
    question: "אפשר לשנות את הבחירה אחרי שבחרתי?",
    answer:
      "כן. אפשר לשנות את התחזית שלכם כמה שרוצים כל עוד השאלה פתוחה. ברגע שהשאלה נסגרת הבחירה ננעלת ולא ניתן לשנות אותה יותר.",
  },
  {
    question: "מה קורה כשהשאלה נסגרת?",
    answer:
      "כשהשאלה נסגרת היא נבדקת מול מקור רשמי מצוטט. אצל כל מי שחזה, מספר התחזיות שנסגרו עולה באחד; מי שבחר נכון מקבל גם ניצחון, ומאזן הדיוק שלו עולה. שאלה שנסגרה לעולם לא נפתחת מחדש.",
  },
  {
    question: "מה זה מאזן דיוק?",
    answer:
      "מאזן הדיוק הוא הניקוד היחיד בפוליטיקל: מספר התחזיות שצדקתם מתוך אלה שנסגרו. מספר הטעויות הוא פשוט מספר התחזיות שנסגרו פחות מספר הניצחונות. אין נקודות שנצברות סתם על פעילות.",
  },
  {
    question: "מה אומרת החלוקה בין התוצאות בכל שאלה?",
    answer:
      "החלוקה שמוצגת היא ספירה חיה של כמה משתתפים בחרו כל תוצאה. זו לא קופה כספית ולא סיכוי מחושב, אלא פשוט תמונה של איפה דעת הקהל עומדת ברגע נתון.",
  },
  {
    question: "מה קורה אם שאלה מבוטלת?",
    answer:
      "שאלה יכולה להתבטל אם היא הופכת לבלתי ניתנת להכרעה. שאלה מבוטלת לא נספרת לאף אחד: היא לא מוסיפה ניצחון ולא מוסיפה למספר התחזיות שנסגרו. גם שאלה מבוטלת לעולם לא נפתחת מחדש.",
  },
  {
    question: "אפשר להפסיד נקודות בפוליטיקל?",
    answer:
      "לא. אי אפשר להפסיד נקודות ואין בפוליטיקל כסף בכלל: לא מטבעות, לא הימור, לא פיקדונות ולא פרסים. תחזית שגויה פשוט לא מוסיפה ניצחון, והניקוד היחיד הוא מאזן הדיוק.",
  },
];

export const howItWorksArticleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: PAGES["/guides/how-it-works"].title,
  description:
    "כל תחזית בפוליטיקל היא בחירה של תוצאה אחת בשאלה פוליטית. אפשר לשנות את הבחירה עד שהשאלה נסגרת; אז תחזית נכונה מוסיפה ניצחון ומעלה את מאזן הדיוק. אין הימור ואין נקודות שמפסידים.",
  datePublished: "2026-09-14",
  dateModified: "2026-09-14",
  author: SITE_AUTHOR,
  publisher: SITE_PUBLISHER,
  inLanguage: "he",
  mainEntityOfPage: { "@type": "WebPage", "@id": absUrl("/guides/how-it-works") },
} as const;

export const howItWorksFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: howItWorksFaqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
} as const;

export const howItWorksBreadcrumbJsonLd = buildBreadcrumbJsonLd({
  trail: [
    { name: "מדריכים", path: "/site-index" },
    { name: "איך עובדות תחזיות", path: "/guides/how-it-works" },
  ],
});
