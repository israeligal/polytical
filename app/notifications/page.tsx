import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listNotifications } from "@/app/lib/notifications/service";
import { NotificationFeed, type FeedItem } from "@/components/notifications/notification-feed";
import { EnablePush } from "@/components/pwa/enable-push";

// The notifications feed. Gated by proxy.ts; redirect defensively too.
export default async function NotificationsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=%2Fnotifications");

  const rows = await listNotifications({ userId: session.user.id });
  const items: FeedItem[] = rows.map((n) => ({
    id: n.id,
    type: n.type,
    titleHe: n.titleHe,
    bodyHe: n.bodyHe,
    refMarketId: n.refMarketId,
    read: n.read,
    createdAtIso: n.createdAt.toISOString(),
  }));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="font-accent text-sm font-bold text-primary">העדכונים שלך</p>
        <h1 className="font-display text-3xl text-foreground sm:text-4xl">התראות</h1>
      </header>
      <EnablePush />
      <NotificationFeed items={items} />
    </main>
  );
}
