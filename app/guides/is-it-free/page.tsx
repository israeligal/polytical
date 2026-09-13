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
  isItFreeFaqs,
  isItFreeArticleJsonLd,
  isItFreeFaqJsonLd,
  isItFreeBreadcrumbJsonLd,
} from "./is-it-free-jsonld";

export const metadata: Metadata = {
  title: PAGES["/guides/is-it-free"].title,
  description:
    "פוליטיקל חינמי לגמרי: אין כסף אמיתי, פיקדונות או פרסים כספיים, ולא נאספים פרטי תשלום. זה משחק תחזיות לבידור, לא הימור. הניקוד היחיד הוא מאזן הדיוק שלכם.",
  alternates: { canonical: "/guides/is-it-free" },
  openGraph: {
    title: PAGES["/guides/is-it-free"].title,
    description:
      "פוליטיקל חינמי לגמרי ואין בו כסף אמיתי. זה משחק תחזיות לבידור, לא הימור: לא מסכנים דבר ואי אפשר להפסיד.",
    url: "/guides/is-it-free",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: PAGES["/guides/is-it-free"].title,
    description: "פוליטיקל חינמי לגמרי, בלי כסף אמיתי. משחק תחזיות לבידור, לא הימור.",
  },
};

export default function IsItFreePage() {
  return (
    <MarketingMain>
      <Hero
        eyebrow="חינם ולא הימור"
        title="האם פוליטיקל בחינם? והאם זה הימורים?"
        lead={
          <>
            כן, פוליטיקל חינמי לגמרי, ולא, זה לא הימור. אין כסף אמיתי, אין פיקדונות ואין פרסים כספיים,
            ואיננו אוספים פרטי תשלום. לא מסכנים דבר ואי אפשר להפסיד כסף או נקודות: הניקוד היחיד הוא
            מאזן הדיוק שלכם.
          </>
        }
      />

      <AtAGlance
        rows={[
          { label: "עלות", value: "חינם לגמרי. אין כסף אמיתי, פיקדונות או פרסים כספיים, ולא נאספים פרטי תשלום." },
          { label: "הימור?", value: "לא. לא מסכנים כלום, אי אפשר להפסיד כסף או נקודות, ואין זכייה כספית." },
          { label: "הניקוד היחיד", value: "מאזן הדיוק שלכם: כמה תחזיות צדקתם מתוך אלה שנסגרו." },
          { label: "החלוקה בשאלה", value: "ספירת המשתתפים שבחרו כל תוצאה, לא קופה כספית ולא סיכוי מחושב." },
          { label: "מה זה לא", value: "לא גוף סוקר, לא שוק הון, ואין בו ייעוץ כלכלי או פוליטי." },
          { label: "גיל", value: "מותר מגיל 13 ומעלה." },
        ]}
      />

      <Section title="האם פוליטיקל עולה כסף">
        <p>
          לא. פוליטיקל חינמי לגמרי. אין בו כסף אמיתי, אין פיקדונות ואין פרסים כספיים, ואיננו אוספים
          פרטי תשלום. אין גם גרסה בתשלום ולא דרך לקנות דירוג: הכול פתוח לכולם באותה מידה. אם אתם עוד לא
          מכירים את הזירה, אפשר להתחיל מ
          <Link className="text-primary underline" href="/about">
            מה זה פוליטיקל
          </Link>
          .
        </p>
      </Section>

      <Section title="האם זה הימורים">
        <p>
          לא. הימור דורש שמסכנים משהו כדי אולי לזכות בסכום. בפוליטיקל אין מה להמר: לא מסכנים כסף ולא
          נקודות, אי אפשר להפסיד, ואין זכייה כספית. בחירת תוצאה שמתבררת כשגויה פשוט לא נספרת כניצחון,
          וזהו. לפי{" "}
          <Link className="text-primary underline" href="/terms">
            תנאי השימוש
          </Link>{" "}
          זהו משחק תחזיות לבידור בלבד, לא פלטפורמת הימורים.
        </p>
      </Section>

      <Section title="אם אין כסף, מה מרוויחים">
        <p>
          הזכייה היחידה היא מאזן הדיוק שלכם: כמה תחזיות צדקתם מתוך אלה שנסגרו. לצד זה אפשר לאסוף קלפי
          פוליטיקאים דיגיטליים שנפתחים לפי דיוק. הקלפים נטולי ערך כספי ואינם ניתנים להעברה, ואי אפשר
          להמיר דבר לכסף.
        </p>
        <Bullets
          items={[
            "מאזן דיוק: תחזית נכונה מוסיפה ניצחון ומעלה את המאזן. אי אפשר להפסיד נקודות.",
            "קלפי איסוף דיגיטליים: נפתחים לפי דיוק, נטולי ערך כספי ואינם ניתנים להעברה.",
            "אין קופה, אין תשלום ואין המרה לכסף בשום שלב.",
          ]}
        />
        <p>
          איך התחזיות נספרות בפירוט מוסבר במדריך{" "}
          <Link className="text-primary underline" href="/guides/how-it-works">
            איך עובדות תחזיות בפוליטיקל
          </Link>
          .
        </p>
      </Section>

      <Section title="האם יש פרסומות או מכירת מידע">
        <p>
          אין פרסומות ואיננו מוכרים מידע אישי. מעבר לחשבון ולפעילות שלכם בשירות, הנתון היחיד שנאסף הוא
          דיווחי שגיאה אנונימיים, ששימושם היחיד הוא לאתר ולתקן תקלות. הפירוט המלא של מה נאסף ומה לא
          נמצא ב
          <Link className="text-primary underline" href="/privacy">
            מדיניות הפרטיות
          </Link>
          .
        </p>
      </Section>

      <Section title="מגיל כמה מותר">
        <p>
          השימוש בפוליטיקל מותר מגיל 13 ומעלה. מכיוון שאין בו כסף, הימור או פרסים כספיים, זהו משחק ידע
          שמתאים לכל מי שעוקב אחרי הפוליטיקה הישראלית ורוצה לבדוק אם הוא קורא את המפה נכון.
        </p>
      </Section>

      <Section title="במה זה שונה מאתר הימורים">
        <p>
          באתר הימורים מפקידים כסף, מסכנים אותו על תוצאה, ויכולים לזכות או להפסיד סכומים לפי הסיכויים.
          בפוליטיקל אין אף אחד מהמרכיבים האלה: לא מסכנים דבר, אין זכייה כספית, והחלוקה שמוצגת בכל שאלה
          היא ספירת המשתתפים שבחרו כל תוצאה, לא קופה ולא סיכוי מחושב. פוליטיקל גם אינו גוף סוקר, אינו
          שוק הון, ואינו נותן ייעוץ כלכלי או פוליטי. אם אתם מתלבטים אם זה בשבילכם, ראו{" "}
          <Link className="text-primary underline" href="/guides/who-is-it-for">
            למי מתאים פוליטיקל
          </Link>
          .
        </p>
      </Section>

      <KeyTakeaways
        title="עיקרי הדברים"
        items={[
          "פוליטיקל חינמי לגמרי: אין כסף אמיתי, פיקדונות או פרסים כספיים, ולא נאספים פרטי תשלום.",
          "זה לא הימור: לא מסכנים דבר, אי אפשר להפסיד כסף או נקודות, ואין זכייה כספית.",
          "הניקוד היחיד הוא מאזן הדיוק; החלוקה בכל שאלה היא ספירת משתתפים, לא קופה ולא סיכוי מחושב.",
          "לפי תנאי השימוש זהו משחק תחזיות לבידור; הקלפים הדיגיטליים נטולי ערך כספי ואינם ניתנים להעברה.",
          "אין פרסומות ואין מכירת מידע אישי, והשימוש מותר מגיל 13 ומעלה.",
        ]}
      />

      <Faq items={isItFreeFaqs} />

      <RelatedPages slug="/guides/is-it-free" />
      <CtaSection />

      <JsonLd payload={isItFreeArticleJsonLd} />
      <JsonLd payload={isItFreeFaqJsonLd} />
      <JsonLd payload={isItFreeBreadcrumbJsonLd} />
    </MarketingMain>
  );
}
