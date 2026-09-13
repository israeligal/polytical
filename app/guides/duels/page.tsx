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
  duelsFaqs,
  duelsArticleJsonLd,
  duelsFaqJsonLd,
  duelsBreadcrumbJsonLd,
} from "./duels-jsonld";

export const metadata: Metadata = {
  title: PAGES["/guides/duels"].title,
  description:
    "דו-קרב בפוליטיקל הוא תחזית ראש בראש על שאלה אחת: יוצרים קישור אתגר, שולחים לחבר, כל צד בוחר תוצאה, ומי שצדק כשהשאלה נסגרת מנצח. בשביל כבוד בלבד, בלי כסף.",
  alternates: { canonical: "/guides/duels" },
  openGraph: {
    title: PAGES["/guides/duels"].title,
    description:
      "תחזית ראש בראש על שאלה אחת: שולחים קישור אתגר לחבר, כל אחד בוחר תוצאה, ומי שצדק כשהשאלה נסגרת מנצח.",
    url: "/guides/duels",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: PAGES["/guides/duels"].title,
    description: "דו-קרב תחזיות ראש בראש על שאלה אחת, דרך קישור אתגר. בשביל כבוד בלבד, בלי כסף.",
  },
};

export default function DuelsPage() {
  return (
    <MarketingMain>
      <Hero
        eyebrow="דו-קרב"
        title="איך מאתגרים חבר בדו-קרב תחזיות?"
        lead={
          <>
            דו-קרב הוא תחזית ראש בראש על שאלה אחת: יוצרים קישור אתגר, שולחים אותו לחבר, כל צד בוחר
            תוצאה, ומי שצדק כשהשאלה נסגרת מנצח בדו-קרב. הכל בשביל כבוד בלבד, בלי כסף, בלי הימור ובלי
            פרסים.
          </>
        }
      />

      <AtAGlance
        rows={[
          { label: "מה זה", value: "תחזית ראש בראש על שאלה אחת: כל צד בוחר תוצאה, ומי שצדק כשהשאלה נסגרת מנצח." },
          { label: "איך מזמינים", value: "יוצרים קישור אתגר ושולחים לחבר; החבר פשוט פותח את הקישור ובוחר תוצאה." },
          { label: "אילו שאלות", value: "שאלות שנסגרות בקרוב, בזירה הארצית בלבד, לא בתוך קואליציה פרטית." },
          { label: "מי מנצח", value: "מי שבחר את התוצאה הנכונה כשהשאלה נסגרת מנצח בדו-קרב." },
          { label: "אחרי הסיום", value: "אפשר לפתוח ריצ׳מטש מול אותו חבר ולשתף את התוצאה." },
          { label: "עלות", value: "בשביל כבוד בלבד. אין כסף, אין הימור ואין פרסים." },
        ]}
      />

      <Section title="מה זה דו-קרב">
        <p>
          דו-קרב הוא תחזית ראש בראש על שאלה אחת. במקום להתווכח מי צודק, שני הצדדים בוחרים תוצאה לאותה
          שאלה, וכשהשאלה נסגרת רואים מי צדק. מי שבחר נכון מנצח בדו-קרב. אין בזה כסף, אין הימור ואין
          פרסים: זה בשביל כבוד בלבד.
        </p>
        <p>
          זו אותה תחזית כמו בכל שאר{" "}
          <Link className="text-primary underline" href="/guides/how-it-works">
            המשחק בפוליטיקל
          </Link>
          , רק שהפעם היא מכוונת מולכם לחבר אחד, ראש בראש.
        </p>
      </Section>

      <Section title="איך מזמינים חבר לדו-קרב">
        <Bullets
          items={[
            "בוחרים שאלה פתוחה ויוצרים עליה קישור אתגר שאפשר לשתף.",
            "שולחים את הקישור לחבר בכל דרך שנוחה לכם.",
            "החבר פותח את הקישור ובוחר את התוצאה שלו; אתם בוחרים את שלכם.",
          ]}
        />
        <p>
          כדי ליצור דו-קרב צריך להיות מחוברים, אבל הצד שמקבל את הקישור לא חייב חשבון כדי לענות דרכו.
        </p>
      </Section>

      <Section title="על אילו שאלות אפשר להתמודד">
        <p>
          דו-קרב רץ על שאלות שנסגרות בקרוב, כדי שההכרעה תגיע מהר. זה עובד רק בזירה הארצית: אי אפשר
          לפתוח דו-קרב בתוך{" "}
          <Link className="text-primary underline" href="/guides/coalitions">
            קואליציה פרטית
          </Link>
          . כל צד בוחר תוצאה אחת לאותה שאלה, ומחכים לסגירה.
        </p>
      </Section>

      <Section title="איך נקבע המנצח">
        <p>
          כל צד בוחר תוצאה אחת לשאלה, וכשהשאלה נסגרת המערכת בודקת מי צדק. מי שבחר את התוצאה הנכונה
          מנצח בדו-קרב. אין כאן ניקוד כספי ואין הימור בסכום, רק מי צדק ומי טעה.
        </p>
      </Section>

      <Section title="אפשר ריצ׳מטש ולשתף תוצאה">
        <p>
          אחרי שהדו-קרב מוכרע אפשר לפתוח ריצ׳מטש מול אותו חבר על שאלה חדשה, וגם לשתף את התוצאה כדי
          שכולם יראו מי צדק. ככה ממשיכים את התחרות סבב אחרי סבב, על כבוד בלבד.
        </p>
      </Section>

      <Section title="האם צריך חשבון">
        <p>
          כדי ליצור דו-קרב ולשלוח קישור אתגר צריך להיות מחוברים. הצד שמקבל את הקישור פשוט פותח אותו
          ובוחר תוצאה. ההרשמה חינמית, ואחרי שנרשמתם אפשר גם לאסוף{" "}
          <Link className="text-primary underline" href="/guides/cards">
            קלפי פוליטיקאים
          </Link>{" "}
          שנפתחים לפי דיוק בתחזיות.
        </p>
      </Section>

      <KeyTakeaways
        title="עיקרי הדברים"
        items={[
          "דו-קרב הוא תחזית ראש בראש על שאלה אחת: מי שצדק כשהשאלה נסגרת מנצח.",
          "יוצרים קישור אתגר ושולחים לחבר; החבר פשוט פותח את הקישור ובוחר תוצאה.",
          "דו-קרב רץ על שאלות שנסגרות בקרוב, בזירה הארצית בלבד, לא בתוך קואליציה פרטית.",
          "כדי לפתוח דו-קרב צריך להיות מחוברים; לחבר מספיק לפתוח את הקישור.",
          "הדו-קרב הוא בשביל כבוד בלבד: אין כסף, אין הימור ואין פרסים.",
        ]}
      />

      <Faq items={duelsFaqs} />

      <RelatedPages slug="/guides/duels" />
      <CtaSection />

      <JsonLd payload={duelsArticleJsonLd} />
      <JsonLd payload={duelsFaqJsonLd} />
      <JsonLd payload={duelsBreadcrumbJsonLd} />
    </MarketingMain>
  );
}
