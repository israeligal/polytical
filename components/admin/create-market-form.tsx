"use client";

import { useRef, useState, useTransition } from "react";
import type { MarketKind, OutcomeInput, PoliticianOption } from "@/lib/types";
import { createMarketAction } from "@/app/actions/admin-markets";
import { MULTI_MAX_OUTCOMES, MULTI_MIN_OUTCOMES } from "@/app/lib/markets/constants";
import { PoliticianPicker } from "@/components/admin/politician-picker";

const FIELD =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
const LABEL = "mb-1 block text-sm font-bold text-foreground";

/** Current local time in the `datetime-local` value format (YYYY-MM-DDTHH:mm). */
function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

interface MultiRow {
  key: number;
  labelHe: string;
  person: PoliticianOption | null;
}

/**
 * Functional-plain admin form to create a market. Two kinds: yes/no (two
 * labels) and multi — a single-pick market with MULTI_MIN..MULTI_MAX candidate
 * outcomes, each optionally linked to the politician it IS (the link drives the
 * outcome-row portrait and scopes card progress to the picked MK on resolve).
 * Politicians are chosen via name autocomplete that resolves to the stable
 * personId — never typed ids, never raw Hebrew strings. Submits via the admin
 * server action (which re-checks admin) and shows the result message.
 * Deliberately unpolished — this is an internal console, not a public surface.
 */
export function CreateMarketForm({
  categories,
}: {
  categories: { key: string; he: string }[];
}) {
  const [kind, setKind] = useState<MarketKind>("binary");
  const [hot, setHot] = useState(false);
  const [binaryOutcomes, setBinaryOutcomes] = useState<[string, string]>(["כן", "לא"]);
  const rowKey = useRef(0);
  const freshRow = (): MultiRow => ({ key: rowKey.current++, labelHe: "", person: null });
  const [rows, setRows] = useState<MultiRow[]>(() => [freshRow(), freshRow(), freshRow()]);
  const [featured, setFeatured] = useState<PoliticianOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  function setBinaryOutcome(i: 0 | 1, value: string) {
    setBinaryOutcomes((prev) => (i === 0 ? [value, prev[1]] : [prev[0], value]));
  }

  function setRow(key: number, patch: Partial<Omit<MultiRow, "key">>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addFeatured(option: PoliticianOption | null) {
    if (!option) return;
    setFeatured((prev) =>
      prev.some((p) => p.personId === option.personId) ? prev : [...prev, option],
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    const outcomes: OutcomeInput[] =
      kind === "binary"
        ? binaryOutcomes.map((labelHe) => ({ labelHe }))
        : rows.map((r) => ({ labelHe: r.labelHe, personId: r.person?.personId }));

    setMessage(null);
    startTransition(async () => {
      try {
        const res = await createMarketAction({
          questionHe: String(fd.get("questionHe") ?? ""),
          descriptionHe: String(fd.get("descriptionHe") ?? ""),
          category: String(fd.get("category") ?? ""),
          hot,
          closeAt: String(fd.get("closeAt") ?? ""),
          type: kind,
          outcomes,
          personIds: featured.map((p) => p.personId),
        });
        setOk(res.ok);
        setMessage(res.message ?? (res.ok ? "השוק נוצר" : "שגיאה"));
        if (res.ok) {
          form.reset();
          setBinaryOutcomes(["כן", "לא"]);
          setRows([freshRow(), freshRow(), freshRow()]);
          setFeatured([]);
          setHot(false);
        }
      } catch {
        setOk(false);
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <label className={LABEL} htmlFor="questionHe">
          שאלת השוק
        </label>
        <input id="questionHe" name="questionHe" required className={FIELD} placeholder="האם…? / מי…?" />
      </div>

      <div>
        <label className={LABEL} htmlFor="descriptionHe">
          תיאור / קריטריון הכרעה (לא חובה)
        </label>
        <textarea id="descriptionHe" name="descriptionHe" rows={2} className={FIELD} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="category">
            קטגוריה
          </label>
          <select id="category" name="category" className={FIELD} defaultValue={categories[0]?.key}>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.he}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="closeAt">
            מועד סגירה
          </label>
          <input
            id="closeAt"
            name="closeAt"
            type="datetime-local"
            dir="ltr"
            min={nowLocalInput()}
            required
            className={FIELD}
          />
        </div>
      </div>

      <label className="flex items-center gap-1 text-sm font-bold text-foreground">
        <input type="checkbox" checked={hot} onChange={(e) => setHot(e.target.checked)} />
        שוק חם
      </label>

      <fieldset>
        <legend className={LABEL}>סוג השוק</legend>
        <div className="flex gap-4 text-sm font-semibold text-foreground">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="kind"
              checked={kind === "binary"}
              onChange={() => setKind("binary")}
            />
            כן/לא
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="kind"
              checked={kind === "multi"}
              onChange={() => setKind("multi")}
            />
            רב-ברירה (מי/מה)
          </label>
        </div>
      </fieldset>

      {kind === "binary" ? (
        <div>
          <span className={LABEL}>תוצאות (כן/לא)</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={binaryOutcomes[0]}
              onChange={(e) => setBinaryOutcome(0, e.target.value)}
              className={FIELD}
              aria-label="תוצאה חיובית"
            />
            <input
              value={binaryOutcomes[1]}
              onChange={(e) => setBinaryOutcome(1, e.target.value)}
              className={FIELD}
              aria-label="תוצאה שלילית"
            />
          </div>
        </div>
      ) : (
        <div>
          <span className={LABEL}>
            תשובות ({MULTI_MIN_OUTCOMES}–{MULTI_MAX_OUTCOMES}) — אפשר לקשר כל תשובה לפוליטיקאי
          </span>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={row.key} className="grid items-start gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  value={row.labelHe}
                  onChange={(e) => setRow(row.key, { labelHe: e.target.value })}
                  className={FIELD}
                  placeholder={`תשובה ${i + 1}`}
                  aria-label={`תווית תשובה ${i + 1}`}
                />
                <PoliticianPicker
                  value={row.person}
                  onChange={(person) => setRow(row.key, { person })}
                  placeholder="קישור לפוליטיקאי (לא חובה)"
                />
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  disabled={rows.length <= MULTI_MIN_OUTCOMES}
                  aria-label={`מחיקת תשובה ${i + 1}`}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-negative disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, freshRow()])}
            disabled={rows.length >= MULTI_MAX_OUTCOMES}
            className="mt-2 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary disabled:opacity-40"
          >
            + הוספת תשובה
          </button>
        </div>
      )}

      <div>
        <span className={LABEL}>פוליטיקאים מובילים נוספים (לא חובה)</span>
        {featured.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2">
            {featured.map((p) => (
              <li
                key={p.personId}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-sunken px-3 py-1.5 text-sm font-semibold text-foreground"
              >
                {p.nameHe}
                <button
                  type="button"
                  onClick={() =>
                    setFeatured((prev) => prev.filter((f) => f.personId !== p.personId))
                  }
                  aria-label={`הסרת ${p.nameHe}`}
                  className="text-muted-foreground transition-colors hover:text-negative"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <PoliticianPicker value={null} onChange={addFeatured} placeholder="הוספה לפי שם…" />
        <p className="mt-1 text-xs text-muted-foreground">
          פוליטיקאים שקושרו לתשובות מתווספים אוטומטית — אין צורך להוסיף אותם שוב.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-5 py-2.5 font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "יוצר…" : "צור שוק"}
        </button>
        {message && (
          <span
            role="status"
            className={`text-sm font-semibold ${ok ? "text-positive" : "text-negative"}`}
          >
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
