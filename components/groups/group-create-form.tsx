"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGroupAction } from "@/app/actions/groups";

// Bounds mirror app/lib/groups/schemas.ts (the service is the authority).
const NAME_MAX = 40;
const DESC_MAX = 280;

const FIELD =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
const LABEL = "mb-1 block text-sm font-bold text-foreground";

export function GroupCreateForm() {
  const router = useRouter();
  const [nameHe, setNameHe] = useState("");
  const [descriptionHe, setDescriptionHe] = useState("");
  const [emblem, setEmblem] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await createGroupAction({
          nameHe,
          descriptionHe: descriptionHe.trim() || null,
          emblem: emblem.trim() || null,
        });
        if (res.ok && res.slug) {
          router.push(`/g/${res.slug}`);
          return;
        }
        setMessage(res.message ?? "שגיאה");
      } catch {
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  const remaining = NAME_MAX - nameHe.length;

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <label className={LABEL} htmlFor="group-name">שם הקואליציה</label>
        <div className="flex gap-2">
          <input
            id="group-emblem"
            value={emblem}
            onChange={(e) => setEmblem(e.target.value.slice(0, 4))}
            className={`${FIELD} w-16 text-center`}
            placeholder="🏛️"
            aria-label="סמל"
          />
          <input
            id="group-name"
            value={nameHe}
            onChange={(e) => setNameHe(e.target.value.slice(0, NAME_MAX))}
            required
            className={`${FIELD} flex-1`}
            placeholder="למשל: חבר׳ה מהעבודה"
          />
        </div>
        <p className="mt-1 text-start text-xs text-muted-foreground">
          <span className="nums">{remaining}</span> תווים נותרו
        </p>
      </div>

      <div>
        <label className={LABEL} htmlFor="group-desc">תיאור (לא חובה)</label>
        <textarea
          id="group-desc"
          value={descriptionHe}
          onChange={(e) => setDescriptionHe(e.target.value.slice(0, DESC_MAX))}
          rows={3}
          className={FIELD}
          placeholder="על מה הקואליציה הזו?"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || nameHe.trim().length < 2}
          className="rounded-lg bg-primary px-5 py-2.5 font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "יוצרים…" : "צרו קואליציה"}
        </button>
        {message && <span role="status" className="text-sm font-semibold text-negative">{message}</span>}
      </div>
    </form>
  );
}
