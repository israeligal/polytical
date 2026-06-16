"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGroupAction } from "@/app/actions/groups";
import { leadingEmoji } from "@/lib/group-display";

// Bounds mirror app/lib/groups/schemas.ts (the service is the authority).
const NAME_MAX = 40;
const DESC_MAX = 280;

const FIELD =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
const LABEL = "mb-1 block text-sm font-bold text-foreground";

// Quick-pick emojis for the name. Users can still type any emoji via the OS
// keyboard — this is just the fast path so it's discoverable.
const EMOJI_PRESETS = [
  "🏛️", "🗳️", "⚖️", "🏆", "🦁", "🕊️", "⭐", "🔥",
  "💪", "🎯", "👥", "🤝", "🚀", "💡", "📊", "🧭",
  "🔵", "🔴", "🟢", "🟡", "🟣", "🟠", "🇮🇱", "✊",
];

// Code-point aware: an emoji counts as one "character" and never gets cut in
// half (plain String.slice would split surrogate pairs).
const charCount = (s: string) => [...s].length;
const truncateChars = (s: string, max: number) => [...s].slice(0, max).join("");

export function GroupCreateForm() {
  const router = useRouter();
  const [nameHe, setNameHe] = useState("");
  const [descriptionHe, setDescriptionHe] = useState("");
  const [seedForecasts, setSeedForecasts] = useState(true);
  const [seedCount, setSeedCount] = useState<"top10" | "all">("top10");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pickerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Close the emoji popover on outside click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  // Insert an emoji at the caret (or append) and keep focus in the name field.
  function insertEmoji(emoji: string) {
    const el = nameRef.current;
    const start = el?.selectionStart ?? nameHe.length;
    const end = el?.selectionEnd ?? nameHe.length;
    const next = truncateChars(nameHe.slice(0, start) + emoji + nameHe.slice(end), NAME_MAX);
    setNameHe(next);
    setPickerOpen(false);
    // Restore focus + place the caret just after the inserted emoji.
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start + emoji.length;
      el.setSelectionRange(caret, caret);
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      try {
        const trimmed = nameHe.trim();
        const res = await createGroupAction({
          nameHe: trimmed,
          descriptionHe: descriptionHe.trim() || null,
          // The group's icon is the leading emoji of the name (if any).
          emblem: leadingEmoji(trimmed),
          seedForecasts,
          seedCount,
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

  const remaining = NAME_MAX - charCount(nameHe);

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <label className={LABEL} htmlFor="group-name">שם הקואליציה</label>
        <div className="relative">
          <input
            ref={nameRef}
            id="group-name"
            value={nameHe}
            onChange={(e) => setNameHe(truncateChars(e.target.value, NAME_MAX))}
            required
            className={`${FIELD} pe-12`}
            placeholder="למשל: 🦁 חבר׳ה מהעבודה"
          />
          {/* Emoji button lives inside the name field — adding an emoji to the
              name is the whole interaction; no separate icon field. */}
          <div className="absolute inset-y-0 end-1 flex items-center" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              aria-label="הוספת אימוג׳י לשם"
              aria-expanded={pickerOpen}
              title="הוספת אימוג׳י"
              className="grid h-8 w-8 place-items-center rounded-md text-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              😊
            </button>

            {pickerOpen && (
              <div className="absolute end-0 top-full z-40 mt-2 w-64 rounded-xl border border-border bg-card p-3 shadow-lg">
                <span className="mb-2 block text-xs font-bold text-foreground">הוסיפו אימוג׳י לשם</span>
                <div className="grid grid-cols-8 gap-1">
                  {EMOJI_PRESETS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => insertEmoji(e)}
                      aria-label={`הוספת ${e}`}
                      className="grid h-7 w-7 place-items-center rounded-md text-lg transition-colors hover:bg-muted"
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  אפשר גם להקליד אימוג׳י ישירות בשם
                </p>
              </div>
            )}
          </div>
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

      {/* Starter forecasts — on by default so the new coalition isn't an empty
          room; clones the latest national forecasts in. */}
      <div className="rounded-lg border border-border bg-muted p-3">
        <label className="flex items-start gap-2.5 text-sm font-semibold text-foreground">
          <input
            type="checkbox"
            checked={seedForecasts}
            onChange={(e) => setSeedForecasts(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span>
            התחילו עם התחזיות הלאומיות האחרונות
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
              כדי שהקואליציה לא תתחיל ריקה — אפשר להכריע או למחוק בהמשך.
            </span>
          </span>
        </label>
        {seedForecasts && (
          <div className="mt-3 flex gap-2 ps-6">
            {(
              [
                ["top10", "10 האחרונות"],
                ["all", "כל הפתוחות"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSeedCount(value)}
                aria-pressed={seedCount === value}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                  seedCount === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
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
