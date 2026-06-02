import Link from "next/link";
import { redirect } from "next/navigation";
import type { Politician } from "@/lib/types";
import { getSession } from "@/lib/auth";
import { getAllPoliticians } from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { getOwnedPersonIds } from "@/app/lib/cards/service";
import { COLLECT_COST } from "@/app/lib/economy";
import { ChevronForward } from "@/components/icons";
import { CollectionGallery, type CollectionItem } from "./collection-gallery";

export const metadata = {
  title: "האוסף שלי · פוליטיקל",
  description: "קלפי הקריקטורה שאספתם — וכל מי שעוד אפשר לאסוף.",
};

// Gated by proxy.ts; redirect defensively too. Renders EVERY MK as a card, lit
// up if owned and dimmed/locked otherwise — owned state is resolved server-side
// by stable personId (never fuzzy).
export default async function CollectionPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcollection");

  const [rows, owned] = await Promise.all([
    getAllPoliticians(),
    getOwnedPersonIds({ userId: session.user.id }),
  ]);
  const items: CollectionItem[] = rows.map((r) => ({
    politician: dbToCard(r) as Politician,
    owned: owned.has(r.personId),
  }));

  return (
    <main className="mx-auto max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronForward className="h-4 w-4 rotate-180" />
        חזרה לדף הבית
      </Link>

      <div className="mb-8 max-w-2xl">
        <p className="font-accent text-sm font-bold text-accent">האוסף</p>
        <h1 className="font-display text-4xl text-foreground">הקלפים שלי</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          אספו קלף של כל חבר וחברת כנסת תמורת {COLLECT_COST} שקוינים. קלף שאספתם מואר; היתר נעולים עד שתאספו אותם.
        </p>
      </div>

      <CollectionGallery items={items} />
    </main>
  );
}
