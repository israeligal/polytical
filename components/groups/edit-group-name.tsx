"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateGroupAction } from "@/app/actions/groups";
import { groupIcon, groupTextOnly } from "@/lib/group-display";

// Owner/admin edit of a coalition's name + icon. The icon is the name's leading
// emoji, so a single name field (with the same emoji picker as the create form)
// changes both. Collapsed to the heading + a pencil until you click to edit.

const NAME_MAX = 40;
const EMOJI_PRESETS = [
  "🏛️", "🗳️", "⚖️", "🏆", "🦁", "🕊️", "⭐", "🔥",
  "💪", "🎯", "👥", "🤝", "🚀", "💡", "📊", "🧭",
  "🔵", "🔴", "🟢", "🟡", "🟣", "🟠", "🇮🇱", "✊",
];
const truncateChars = (s: string, max: number) => [...s].slice(0, max).join("");

export function EditGroupName({
  groupId,
  slug,
  nameHe,
  emblem,
  canEdit,
}: {
  groupId: string;
  slug: string;
  nameHe: string;
  emblem: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(nameHe);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
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

  function open() {
    setName(nameHe);
    setMessage(null);
    setEditing(true);
  }

  function cancel() {
    setPickerOpen(false);
    setMessage(null);
    setEditing(false);
  }

  // Insert an emoji at the caret (or append) and keep focus in the field.
  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? name.length;
    const end = el?.selectionEnd ?? name.length;
    const next = truncateChars(name.slice(0, start) + emoji + name.slice(end), NAME_MAX);
    setName(next);
    setPickerOpen(false);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start + emoji.length;
      el.setSelectionRange(caret, caret);
    });
  }

  function save() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setMessage("שם קצר מדי");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await updateGroupAction({ groupId, slug, nameHe: trimmed });
      if (res.ok) {
        setEditing(false);
        router.refresh(); // re-render the header + group switcher with the new name/icon
      } else {
        setMessage(res.message ?? "אירעה שגיאה");
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="text-3xl leading-none">{groupIcon({ nameHe, emblem })}</span>
        <h1 className="min-w-0 truncate font-display text-3xl text-foreground sm:text-4xl">
          {groupTextOnly({ nameHe })}
        </h1>
        {canEdit && (
          <button
            type="button"
            onClick={open}
            aria-label="ערכו שם וסמל"
            title="ערכו שם וסמל"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <div className="relative">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(truncateChars(e.target.value, NAME_MAX))}
          autoFocus
          aria-label="שם הקואליציה"
          dir="auto"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 pe-12 font-display text-xl text-foreground outline-none focus:border-primary"
          placeholder="למשל: 🦁 חבר׳ה מהעבודה"
        />
        <div className="absolute inset-y-0 end-1 flex items-center" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            aria-label="הוספת אימוג׳י"
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
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || name.trim().length < 2}
          className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "שומר…" : "שמרו"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="rounded-full border border-border px-4 py-1.5 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          ביטול
        </button>
        {message && <span role="status" className="text-sm font-semibold text-negative">{message}</span>}
      </div>
    </div>
  );
}
