// Single source of truth for every SEO/marketing page: its title, href, one-line
// summary, its 3-5 related siblings, and the topic grouping. /site-index and
// /llms.txt both read from here so discovery surfaces can never drift.
//
// RULE: each page's metadata.title MUST equal PAGES[slug].title VERBATIM. The
// visible <h1> may differ (shorter), but the <title> must match this map.

export type SeoPage = { title: string; href: string; summary: string };

export const PAGES = {
  "/about": {
    title: "מה זה פוליטיקל? זירת התחזיות של הפוליטיקה בישראל",
    href: "/about",
    summary:
      "פוליטיקל היא זירת תחזיות חינמית על הפוליטיקה הישראלית: בוחרים תוצאה בכל שאלה, וצוברים ניקוד לפי כמה צדקתם. בלי כסף אמיתי.",
  },
  "/guides/how-it-works": {
    title: "איך עובדות תחזיות פוליטיות בפוליטיקל?",
    href: "/guides/how-it-works",
    summary:
      "כל תחזית היא בחירה אחת מתוך כמה תוצאות אפשריות. כשהשאלה נסגרת, תחזית נכונה מוסיפה לכם ניצחון ולמאזן הדיוק. אין הימור, אין נקודות שמפסידים.",
  },
  "/guides/who-is-it-for": {
    title: "למי מתאים פוליטיקל? מדריך למצטרפים חדשים",
    href: "/guides/who-is-it-for",
    summary:
      "פוליטיקל מתאים למי שעוקב אחרי החדשות, מתווכח על פוליטיקה, ורוצה לבדוק אם הוא באמת קורא את המפה נכון. לא מתאים למי שמחפש הימורים בכסף.",
  },
  "/guides/knesset-votes": {
    title: "איך עוקבים אחרי הצבעות חברי הכנסת? (2026)",
    href: "/guides/knesset-votes",
    summary:
      "פוליטיקל מציג הצבעות מליאה אמיתיות של הכנסת ה-25, ישירות מהאתר הרשמי: מי הצביע בעד, נגד או נמנע בכל הצבעה, עם קישור למקור.",
  },
  "/guides/mk-match": {
    title: "איזה חבר כנסת מצביע הכי כמוני? (2026)",
    href: "/guides/mk-match",
    summary:
      "מביעים עמדה על הצבעות אמיתיות במליאה, ופוליטיקל מחשב איזה חבר כנסת הכי קרוב לעמדות שלכם, לפי רשומות ההצבעה הרשמיות.",
  },
  "/guides/coalitions": {
    title: "קבוצות תחזיות פוליטיות פרטיות בפוליטיקל",
    href: "/guides/coalitions",
    summary:
      "קואליציה היא מועדון תחזיות פרטי בהזמנה בלבד: טבלת מובילים נפרדת, הצעות לסדר משלכם, ומליאה קבוצתית, בנפרד מהזירה הארצית.",
  },
  "/guides/cards": {
    title: "קלפי הפוליטיקאים של פוליטיקל: איך אוספים",
    href: "/guides/cards",
    summary:
      "כל פוליטיקאי הוא קלף קריקטורה שנפתח לפי דיוק: מספר התחזיות הנכונות שצריך גדל לפי בכירות הדמות, מ-2 לחבר כנסת ועד 10 לראש ממשלה מכהן.",
  },
  "/guides/is-it-free": {
    title: "האם פוליטיקל בחינם? והאם זה הימורים?",
    href: "/guides/is-it-free",
    summary:
      "פוליטיקל חינמי לגמרי ואין בו כסף אמיתי, פיקדונות או פרסים כספיים. הניקוד היחיד הוא מאזן הדיוק שלכם. זה משחק ידע, לא הימור.",
  },
  "/guides/duels": {
    title: "דו-קרב תחזיות: איך מאתגרים חבר בפוליטיקל",
    href: "/guides/duels",
    summary:
      "דו-קרב הוא תחזית ראש בראש על שאלה אחת: שולחים קישור אתגר לחבר, כל אחד בוחר תוצאה, ומי שצדק כשהשאלה נסגרת מנצח.",
  },
  "/site-index": {
    title: "מפת האתר של פוליטיקל",
    href: "/site-index",
    summary: "כל המדריכים והעמודים של פוליטיקל, מקובצים לפי נושא.",
  },
} as const satisfies Record<string, SeoPage>;

export type PageSlug = keyof typeof PAGES;

// 3-5 topically-tight siblings per page (used by <RelatedPages>).
export const RELATED: Record<PageSlug, PageSlug[]> = {
  "/about": ["/guides/how-it-works", "/guides/who-is-it-for", "/guides/knesset-votes"],
  "/guides/how-it-works": ["/about", "/guides/who-is-it-for", "/guides/cards", "/guides/duels"],
  "/guides/who-is-it-for": ["/about", "/guides/how-it-works", "/guides/is-it-free"],
  "/guides/knesset-votes": ["/guides/mk-match", "/about", "/guides/coalitions"],
  "/guides/mk-match": ["/guides/knesset-votes", "/guides/coalitions", "/guides/how-it-works"],
  "/guides/coalitions": ["/guides/duels", "/guides/mk-match", "/guides/who-is-it-for"],
  "/guides/cards": ["/guides/how-it-works", "/about", "/guides/mk-match"],
  "/guides/is-it-free": ["/about", "/guides/who-is-it-for", "/guides/how-it-works"],
  "/guides/duels": ["/guides/coalitions", "/guides/how-it-works", "/guides/cards"],
  "/site-index": ["/about", "/guides/how-it-works", "/guides/knesset-votes"],
};

// Topic grouping for /site-index and /llms.txt (excludes /site-index itself).
export const TOPICS: { heading: string; slugs: PageSlug[] }[] = [
  {
    heading: "התחלה",
    slugs: ["/about", "/guides/how-it-works", "/guides/who-is-it-for", "/guides/is-it-free"],
  },
  {
    heading: "המשחק",
    slugs: ["/guides/cards", "/guides/duels", "/guides/coalitions"],
  },
  {
    heading: "נתוני הכנסת",
    slugs: ["/guides/knesset-votes", "/guides/mk-match"],
  },
];
