"use client";

// Admin islands for the votes domain (one file, three small widgets — the
// suggestion-review-row pattern: serialized-primitive props, useTransition,
// window.confirm only for terminal acts).

import { useState, useTransition } from "react";
import {
  createAgendaItemAction,
  dismissUnmappedNameAction,
  resolveUnmappedNameAction,
  setAgendaItemStatusAction,
  toggleVoteFeaturedAction,
} from "@/app/actions/admin-votes";

export function VoteFeatureToggle({
  voteId,
  titleHe,
  dateHe,
  initialFeatured,
}: {
  voteId: number;
  titleHe: string;
  dateHe: string;
  initialFeatured: boolean;
}) {
  const [featured, setFeatured] = useState(initialFeatured);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{titleHe}</span>
        <span className="nums block text-xs text-muted-foreground">{dateHe}</span>
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const next = !featured;
          setFeatured(next); // optimistic
          startTransition(async () => {
            try {
              const res = await toggleVoteFeaturedAction({ voteId, featured: next });
              if (!res.ok) setFeatured(!next); // rollback
            } catch {
              setFeatured(!next); // thrown action (e.g. expired admin session) — rollback, don't crash
            }
          });
        }}
        className={`shrink-0 rounded-full border-2 px-4 py-1.5 text-xs font-bold transition-all ${
          featured
            ? "border-accent bg-accent text-accent-foreground"
            : "border-border text-muted-foreground hover:border-accent hover:text-accent"
        } disabled:opacity-60`}
      >
        {featured ? "מובילה ★" : "סמנו כמובילה"}
      </button>
    </div>
  );
}

export function UnmappedNameRow({
  nameKey,
  nameRaw,
  occurrences,
  roster,
}: {
  nameKey: string;
  nameRaw: string;
  occurrences: number;
  /** Full roster incl. departed — a queued name may belong to a former MK. */
  roster: { personId: number; name: string }[];
}) {
  const [personId, setPersonId] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="block text-sm font-bold text-foreground">{nameRaw}</span>
          <span className="nums block text-xs text-muted-foreground">
            {occurrences} הצבעות ממתינות · מפתח: {nameKey}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            aria-label="שיוך לפוליטיקאי"
          >
            <option value="">בחרו פוליטיקאי…</option>
            {roster.map((p) => (
              <option key={p.personId} value={p.personId}>
                {p.name} ({p.personId})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !personId}
            onClick={() =>
              startTransition(async () => {
                try {
                  const res = await resolveUnmappedNameAction({ nameKey, personId: Number(personId) });
                  setMessage(res.message ?? null);
                  if (res.ok) setDone(true);
                } catch {
                  setMessage("אירעה שגיאה — נסו שוב");
                }
              })
            }
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            {pending ? "משייך…" : "שיוך"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`לדחות את "${nameRaw}" לצמיתות? השם לא ייכנס שוב לתור.`)) return;
              startTransition(async () => {
                try {
                  const res = await dismissUnmappedNameAction({ nameKey });
                  if (res.ok) setDone(true);
                } catch {
                  setMessage("אירעה שגיאה — נסו שוב");
                }
              });
            }}
            className="rounded-full border border-border px-4 py-1.5 text-xs font-bold text-muted-foreground hover:text-negative"
          >
            דחייה
          </button>
        </span>
      </div>
      {message && <p className="mt-2 text-xs font-semibold text-negative">{message}</p>}
    </div>
  );
}

export function AgendaAdmin({
  items,
}: {
  items: { id: string; titleHe: string; expectedDate: string | null; status: string }[];
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            try {
              const res = await createAgendaItemAction({ titleHe: title, expectedDate: date || undefined });
              setMessage(res.message ?? null);
              if (res.ok) {
                setTitle("");
                setDate("");
              }
            } catch {
              setMessage("אירעה שגיאה — נסו שוב");
            }
          });
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-bold text-muted-foreground">כותרת ההצעה</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="הצעת חוק…"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-bold text-muted-foreground">תאריך צפוי</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            dir="ltr"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          הוספה
        </button>
      </form>
      {message && <p className="mt-2 text-xs font-semibold text-muted-foreground">{message}</p>}
      {items.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {items.map((a) => (
            <AgendaRow key={a.id} item={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AgendaRow({ item }: { item: { id: string; titleHe: string; expectedDate: string | null; status: string } }) {
  const [status, setStatus] = useState(item.status);
  const [pending, startTransition] = useTransition();
  const STATUS_HE: Record<string, string> = { announced: "על סדר היום", voted: "הוצבעה", dropped: "ירדה" };
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{item.titleHe}</span>
        <span className="block text-xs text-muted-foreground">
          {STATUS_HE[status] ?? status}
          {item.expectedDate && (
            <>
              {" · "}
              <span className="nums" dir="ltr">{item.expectedDate}</span>
            </>
          )}
        </span>
      </span>
      {status === "announced" && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const res = await setAgendaItemStatusAction({ id: item.id, status: "dropped" });
                if (res.ok) setStatus("dropped");
              } catch {
                /* thrown action — keep current status visible */
              }
            })
          }
          className="shrink-0 rounded-full border border-border px-4 py-1.5 text-xs font-bold text-muted-foreground hover:text-negative"
        >
          הורדה מסדר היום
        </button>
      )}
    </li>
  );
}
