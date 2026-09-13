import type { Metadata } from "next";
import Link from "next/link";
import { PAGES } from "@/lib/seo/related-pages";
import { JsonLd } from "@/components/seo/json-ld";
import { RelatedPages } from "@/components/seo/related-pages";
import { CtaSection } from "@/components/seo/cta-section";
import {
  MarketingMain,
  Hero,
  AtAGlance,
  Section,
  Bullets,
  KeyTakeaways,
  Faq,
} from "@/components/seo/marketing";
import {
  aboutFaqs,
  aboutArticleJsonLd,
  aboutFaqJsonLd,
  aboutBreadcrumbJsonLd,
} from "./about-jsonld";

export const metadata: Metadata = {
  title: PAGES["/about"].title,
  description:
    "פוליטיקל היא זירת תחזיות חינמית על הפוליטיקה הישראלית: בוחרים תוצאה בכל שאלה, צוברים ניקוד לפי דיוק, ועוקבים אחרי הצבעות הכנסת. בלי כסף אמיתי.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: PAGES["/about"].title,
    description:
      "זירת תחזיות חינמית על הפוליטיקה הישראלית. בוחרים תוצאה בכל שאלה, צוברים דיוק, ועוקבים אחרי הצבעות הכנסת.",
    url: "/about",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: PAGES["/about"].title,
    description: "זירת תחזיות חינמית על הפוליטיקה הישראלית, בלי כסף אמיתי.",
  },
};

export default function AboutPage() {
  return (
    <MarketingMain>
      <Hero
        eyebrow="אודות"
        title="מה זה פוליטיקל?"
        lead={
          <>
            פוליטיקל היא זירת תחזיות חינמית על הפוליטיקה הישראלית. בוחרים תוצאה בכל שאלה פוליטית
            פתוחה, וכשהשאלה נסגרת צוברים ניצחון אם צדקתם. אין כסף אמיתי, אין הימור, והניקוד היחיד הוא
            מאזן הדיוק שלכם.
          </>
        }
      />

      <AtAGlance
        rows={[
          { label: "מה זה", value: "זירת תחזיות על הפוליטיקה הישראלית: בוחרים תוצאה, צוברים ניקוד לפי דיוק." },
          { label: "עלות", value: "חינם לגמרי. בלי כסף אמיתי, פיקדונות או פרסים כספיים." },
          { label: "איך צוברים ניקוד", value: "כל תחזית נכונה מוסיפה ניצחון ומעלה את מאזן הדיוק. אי אפשר להפסיד נקודות." },
          { label: "הנתונים", value: "הצבעות מליאה אמיתיות של הכנסת ה-25, ישירות מהאתר הרשמי." },
          { label: "שפה", value: "עברית בלבד, מימין לשמאל. זמנים לפי אזור אסיה/ירושלים." },
        ]}
      />

      <Section title="מה זה פוליטיקל">
        <p>
          פוליטיקל היא זירת תחזיות חינמית על הפוליטיקה הישראלית. בכל יום נפתחות שאלות על מה שקורה
          בכנסת, בממשלה ובזירה המפלגתית, ולכל שאלה יש כמה תוצאות אפשריות. אתם בוחרים תוצאה אחת, וכשהשאלה
          נסגרת המערכת בודקת מי צדק. תחזית נכונה מוסיפה לכם ניצחון ומעלה את מאזן הדיוק. אין כסף אמיתי,
          אין הימור בסכום, ואי אפשר להפסיד נקודות.
        </p>
        <p>
          המטרה פשוטה: לתת לכל מי שמתווכח על פוליטיקה דרך לבדוק אם הוא באמת קורא את המפה נכון, לאורך
          זמן ובשקיפות.
        </p>
      </Section>

      <Section title="איך משחקים">
        <Bullets
          items={[
            "בוחרים שאלה פתוחה מהזירה, למשל אם הצעת חוק תעבור בקריאה שנייה ושלישית.",
            "נותנים מנדט: בוחרים את התוצאה שאתם חושבים שתתרחש. אפשר לשנות את הבחירה עד שהשאלה נסגרת.",
            "כשהשאלה נסגרת, בחירה נכונה נספרת כניצחון ומשפרת את מאזן הדיוק שלכם.",
          ]}
        />
        <p>
          החלוקה שמוצגת בכל שאלה היא פשוט הספירה של כמה משתתפים בחרו כל תוצאה, לא קופה כספית ולא סיכוי
          מחושב. ככה רואים איפה דעת הקהל עומדת בלי מספרים מומצאים.
        </p>
      </Section>

      <Section title="מה מודדים: מאזן הדיוק">
        <p>
          הניקוד היחיד בפוליטיקל הוא מאזן הדיוק: מספר התחזיות שצדקתם מתוך התחזיות שנסגרו. טבלת המובילים
          מדרגת את המשתמשים לפי מספר הניצחונות, וכל משתמש מיוצג בכינוי הציבורי שלו בלבד. אין נקודות
          שנצברות סתם על פעילות, ואין דרך לקנות דירוג.
        </p>
      </Section>

      <Section title="מאיפה מגיעים הנתונים">
        <p>
          פוליטיקל מציגה גם הצבעות מליאה אמיתיות של הכנסת ה-25, נמשכות ישירות מהאתר הרשמי של הכנסת.
          בכל הצבעה רואים מי הצביע בעד, נגד או נמנע, עם קישור למקור הרשמי. עובדות ותוצאות מגיעות ממקורות
          רשמיים בלבד, ולעולם לא מניחוש. פרטים נוספים במדריך{" "}
          <Link className="text-primary underline" href="/guides/knesset-votes">
            איך עוקבים אחרי הצבעות חברי הכנסת
          </Link>
          .
        </p>
      </Section>

      <Section title="מה עוד אפשר לעשות">
        <Bullets
          items={[
            <>
              לאסוף{" "}
              <Link className="text-primary underline" href="/guides/cards">
                קלפי פוליטיקאים
              </Link>{" "}
              שנפתחים לפי דיוק בתחזיות על אותה דמות.
            </>,
            <>
              לבדוק{" "}
              <Link className="text-primary underline" href="/guides/mk-match">
                איזה חבר כנסת מצביע כמוכם
              </Link>{" "}
              לפי עמדות על הצבעות אמיתיות.
            </>,
            <>
              לאתגר חבר ב<Link className="text-primary underline" href="/guides/duels">דו-קרב תחזיות</Link>{" "}
              על שאלה אחת, דרך קישור.
            </>,
            <>
              לפתוח{" "}
              <Link className="text-primary underline" href="/guides/coalitions">
                קואליציה
              </Link>
              : מועדון תחזיות פרטי עם טבלת מובילים משלכם.
            </>,
          ]}
        />
      </Section>

      <KeyTakeaways
        title="עיקרי הדברים"
        items={[
          "פוליטיקל היא זירת תחזיות חינמית על הפוליטיקה הישראלית, בלי כסף אמיתי.",
          "כל תחזית היא בחירת תוצאה אחת; תחזית נכונה מעלה את מאזן הדיוק, ואי אפשר להפסיד נקודות.",
          "הצבעות המליאה מגיעות ישירות מהאתר הרשמי של הכנסת ה-25, עם קישור למקור.",
          "אפשר לעיין בלי חשבון; הרשמה חינמית פותחת מנדטים, קלפים, דו-קרבות וקואליציות.",
        ]}
      />

      <Faq items={aboutFaqs} />

      <RelatedPages slug="/about" />
      <CtaSection />

      <JsonLd payload={aboutArticleJsonLd} />
      <JsonLd payload={aboutFaqJsonLd} />
      <JsonLd payload={aboutBreadcrumbJsonLd} />
    </MarketingMain>
  );
}
