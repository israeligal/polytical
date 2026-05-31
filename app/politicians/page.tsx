import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ChevronForward } from "@/components/icons";
import { getAllPoliticians } from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { PoliticiansGallery } from "./politicians-gallery";

export const metadata = {
  title: "כל הפוליטיקאים · פוליטיקל",
  description: "כל חברי וחברות הכנסת — קלפי קריקטורה עם עובדות ממקורות רשמיים.",
};

export default async function PoliticiansPage() {
  const politicians = (await getAllPoliticians()).map(dbToCard);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Link
          href="/#politicians"
          className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          <ChevronForward className="h-4 w-4 rotate-180" />
          חזרה לדף הבית
        </Link>

        <div className="mb-8 max-w-2xl">
          <p className="text-sm font-bold text-primary">הקלפים</p>
          <h1 className="font-display text-4xl font-black text-foreground">
            כל הפוליטיקאים
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            כל חברי וחברות הכנסת המכהנים — קלף קריקטורה לכל אחד, עם עובדות ממקור
            רשמי.
          </p>
        </div>

        <PoliticiansGallery politicians={politicians} />
      </main>
    </>
  );
}
