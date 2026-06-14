"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cloneForecastToGroupAction } from "@/app/actions/groups";
import { useHydrated } from "@/lib/use-hydrated";
import { nowLocalInput } from "@/lib/time";

export interface PickerGroup {
  id: string;
  slug: string;
  nameHe: string;
  emblem: string | null;
}

/** Local "YYYY-MM-DDTHH:mm" a week out — computed in an effect (Date in render is impure). */
function defaultCloseLocal(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * "הביאו לקואליציה" — clone THIS global forecast into one of the viewer's groups
 * as a new group motion. A native <details> picker (matches GroupSwitcher): a
 * shared close-date, then a button per group. Non-destructive; the action
 * re-reads the source server-side.
 */
export function CloneToGroupButton({ sourceMarketId, groups }: { sourceMarketId: string; groups: PickerGroup[] }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const minLocal = hydrated ? nowLocalInput() : undefined;
  const [closeAt, setCloseAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setCloseAt((c) => c || defaultCloseLocal());
  }, []);

  function clone(group: PickerGroup) {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await cloneForecastToGroupAction({
          groupId: group.id,
          slug: group.slug,
          sourceMarketId,
          proposedCloseAt: new Date(closeAt).toISOString(),
        });
        if (res.ok && res.marketId) {
          router.push(`/market/${res.marketId}`);
          return;
        }
        setMessage(res.message ?? "שגיאה");
      } catch {
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 px-3.5 py-1.5 text-sm font-bold text-gold transition-colors hover:border-accent hover:bg-accent/20">
        <span aria-hidden>🏛️</span>
        הביאו לקואליציה
      </summary>
      <div className="absolute end-0 z-40 mt-2 min-w-64 rounded-xl border border-border bg-card p-3 shadow-lg">
        {groups.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            עדיין אינכם בקואליציה.{" "}
            <Link href="/g/new" className="font-semibold text-primary hover:underline">צרו אחת</Link>.
          </p>
        ) : (
          <>
            <label className="mb-1 block text-xs font-bold text-foreground">מתי ההצעה תוכרע?</label>
            <input
              type="datetime-local"
              dir="ltr"
              min={minLocal}
              value={closeAt}
              onChange={(e) => setCloseAt(e.target.value)}
              className="mb-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <p className="mb-1 text-xs font-bold text-muted-foreground">בחרו קואליציה:</p>
            <ul className="space-y-1">
              {groups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    disabled={pending || !closeAt}
                    onClick={() => clone(g)}
                    className="block w-full truncate rounded-lg px-3 py-2 text-start text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    {g.emblem ?? "🏛️"} {g.nameHe}
                  </button>
                </li>
              ))}
            </ul>
            {message && <p role="status" className="mt-2 px-1 text-sm font-semibold text-negative">{message}</p>}
          </>
        )}
      </div>
    </details>
  );
}
