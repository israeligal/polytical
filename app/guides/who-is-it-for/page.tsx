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
  whoIsItForFaqs,
  whoIsItForArticleJsonLd,
  whoIsItForFaqJsonLd,
  whoIsItForBreadcrumbJsonLd,
} from "./who-is-it-for-jsonld";

export const metadata: Metadata = {
  title: PAGES["/guides/who-is-it-for"].title,
  description:
    "פוליטיקל מתאים למי שעוקב אחרי חדשות ופוליטיקה, מתווכח על מה יקרה ורוצה לבדוק לאורך זמן אם הוא קורא את המפה נכון. לא מתאים למי שמחפש הימורים בכסף. חינם, עברית, והניקוד היחיד הוא דיוק.",
  alternates: { canonical: "/guides/who-is-it-for" },
  openGraph: {
    title: PAGES["/guides/who-is-it-for"].title,
    description:
      "למי מתאים פוליטיקל ולמי פחות: מדריך קצר למצטרפים חדשים. חינם, עברית, והניקוד היחיד הוא דיוק.",
    url: "/guides/who-is-it-for",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: PAGES["/guides/who-is-it-for"].title,
    description: "למי מתאים פוליטיקל ולמי פחות. חינם, עברית, והניקוד היחיד הוא דיוק.",
  },
};

export default function WhoIsItForPage() {
  return (
    <MarketingMain>
      <Hero
        eyebrow="למצטרפים חדשים"
        title="למי מתאים פוליטיקל?"
        lead={
          <>
            פוליטיקל מתאים לכם אם אתם עוקבים אחרי חדשות ופוליטיקה, מתווכחים על מה יקרה ורוצים לבדוק
            לאורך זמן אם אתם קוראים את המפה נכון. הוא לא מתאים למי שמחפש הימורים בכסף אמיתי, כי אין כאן
            כסף בכלל, והניקוד היחיד הוא מאזן הדיוק שלכם.
          </>
        }
      />

      <AtAGlance
        rows={[
          { label: "מתאים לך אם", value: "אתה עוקב אחרי חדשות ופוליטיקה ורוצה לבדוק לאורך זמן אם אתה קורא את המפה נכון." },
          { label: "לא מתאים לך אם", value: "אתה מחפש הימורים בכסף אמיתי, פרסים כספיים או תחזית בחירות רשמית." },
          { label: "עלות", value: "חינם. ההרשמה חינמית עם Google או אימייל, ואין כסף בכלל." },
          { label: "ניקוד", value: "הניקוד היחיד הוא דיוק: מאזן התחזיות שצדקתם." },
          { label: "רמת ידע נדרשת", value: "אין צורך להיות מומחה לפוליטיקה. לומדים תוך כדי." },
          { label: "גיל", value: "השימוש מגיל 13 ומעלה." },
        ]}
      />

      <Section title="מתאים לך אם">
        <p>
          פוליטיקל בנוי למי שכבר חי את הפוליטיקה הישראלית ורוצה מקום לבדוק את עצמו. אם אתם מוצאים את
          עצמכם מתווכחים על מה יקרה, זה המקום להפוך את הוויכוח לבדיקה לאורך זמן.
        </p>
        <Bullets
          items={[
            "אתה עוקב אחרי חדשות ופוליטיקה.",
            "אתה מתווכח על מה יקרה ורוצה לבדוק לאורך זמן אם אתה קורא את המפה נכון.",
            "אתה אוהב לאסוף ולהשוות.",
            "אתה רוצה לראות איך חברי הכנסת באמת הצביעו.",
            "אתה מחפש משחק ידע ידידותי בלי כסף.",
          ]}
        />
      </Section>

      <Section title="לא מתאים לך אם">
        <p>
          חשוב להיות ישרים לגבי מה פוליטיקל איננו, כדי שלא תגיעו בציפייה הלא נכונה. אלה המקרים שבהם
          כנראה תחפשו משהו אחר.
        </p>
        <Bullets
          items={[
            "אתה מחפש הימורים בכסף אמיתי או פרסים כספיים. אין כאן כסף.",
            "אתה מחפש סקר מקצועי או תחזית בחירות רשמית. פוליטיקל הוא משחק, לא גוף סוקר.",
            "אתה מתחת לגיל 13.",
          ]}
        />
        <p>
          אם אתם עדיין לא בטוחים שאין כאן שום עלות, אפשר לקרוא בפירוט{" "}
          <Link className="text-primary underline" href="/guides/is-it-free">
            האם פוליטיקל חינמי
          </Link>
          .
        </p>
      </Section>

      <Section title="איך זה עובד בפועל">
        <p>
          אפשר לעיין בפוליטיקל בלי חשבון, כדי לראות איך זה נראה לפני שנרשמים. כשרוצים להשתתף, התהליך
          קצר.
        </p>
        <Bullets
          items={[
            "עוברים על השאלות בזירה בלי חשבון.",
            "נרשמים בחינם עם Google או אימייל.",
            "נותנים מנדט: בוחרים תוצאה בשאלה.",
            "עוקבים אחרי מאזן הדיוק שלכם.",
            "פותחים קלפים ועונות תוך כדי.",
          ]}
        />
        <p>
          מי שרוצה את התמונה המלאה של המסלול יכול לקרוא{" "}
          <Link className="text-primary underline" href="/guides/how-it-works">
            איך פוליטיקל עובד
          </Link>{" "}
          צעד אחר צעד.
        </p>
      </Section>

      <Section title="מה מקבלים">
        <p>
          בשורה התחתונה מקבלים דרך חינמית ובעברית לבדוק אם אתם קוראים את המפה הפוליטית נכון, כשהניקוד
          היחיד הוא דיוק ואין כסף בכלל. לצד זה אפשר לראות איך חברי הכנסת באמת הצביעו, לאסוף ולהשוות
          קלפים, ולעקוב אחרי העונות. רוצים להבין את התמונה הרחבה קודם? קראו{" "}
          <Link className="text-primary underline" href="/about">
            מה זה פוליטיקל
          </Link>
          .
        </p>
      </Section>

      <Section title="האם צריך להיות מומחה לפוליטיקה">
        <p>
          לא. אין צורך להיות מומחה לפוליטיקה כדי להתחיל, ולומדים תוך כדי. מספיק שאתם עוקבים אחרי
          החדשות ורוצים לבדוק אם אתם קוראים את המפה נכון, והדיוק שלכם ישתפר עם הזמן.
        </p>
      </Section>

      <KeyTakeaways
        title="עיקרי הדברים"
        items={[
          "פוליטיקל מתאים למי שעוקב אחרי חדשות ופוליטיקה ורוצה לבדוק לאורך זמן אם הוא קורא את המפה נכון.",
          "הוא לא מתאים למי שמחפש הימורים בכסף אמיתי או תחזית בחירות רשמית, ולא לגיל מתחת ל-13.",
          "אפשר לעיין בלי חשבון; ההרשמה חינמית עם Google או אימייל.",
          "אין צורך להיות מומחה לפוליטיקה, ולומדים תוך כדי.",
          "חינם, עברית, והניקוד היחיד הוא דיוק. אין כסף בכלל.",
        ]}
      />

      <Faq items={whoIsItForFaqs} />

      <RelatedPages slug="/guides/who-is-it-for" />
      <CtaSection />

      <JsonLd payload={whoIsItForArticleJsonLd} />
      <JsonLd payload={whoIsItForFaqJsonLd} />
      <JsonLd payload={whoIsItForBreadcrumbJsonLd} />
    </MarketingMain>
  );
}
