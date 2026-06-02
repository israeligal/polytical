import Link from "next/link";
import { Bell } from "@/components/icons";

/** Header bell → /notifications, with a coral unread badge (capped at 9+). */
export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/notifications"
      aria-label={unreadCount > 0 ? `התראות (${unreadCount} שלא נקראו)` : "התראות"}
      className="relative grid h-9 w-9 place-items-center rounded-[12px] border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -start-1 grid h-4 min-w-4 place-items-center rounded-full bg-negative px-1 text-[10px] font-extrabold text-primary-foreground">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
