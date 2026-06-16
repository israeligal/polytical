"use client";

// "When is it decided?" — quick-pick deadline buttons over a single combined
// date+time control. The pickers stay native (one <input type="datetime-local">
// keeps the date and the hour on the SAME control, opens the OS picker on
// mobile, and stays directly typeable on desktop). The quick-picks are the fun
// part: tap "שבוע" / "חודש" / "יום הבחירות" to drop the close date in one go.
//
// Value is the native `YYYY-MM-DDTHH:mm` local-wall-clock string throughout, so
// `new Date(value).toISOString()` upstream is unchanged. Fully controlled.

import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHydrated } from "@/lib/use-hydrated";
import { ELECTION_DATE } from "@/lib/election";

export interface DateTimeFieldProps {
  /** `YYYY-MM-DDTHH:mm` or "" */
  value: string;
  onChange: (next: string) => void;
  /** Earliest allowed instant as a `YYYY-MM-DDTHH:mm` local string (now). */
  min?: string;
}

const FIELD =
  "w-full rounded-lg border border-border bg-card ps-3 pe-3 py-2.5 text-base text-foreground outline-none transition-colors focus:border-primary";

const DEFAULT_TIME = "23:59"; // quick-picks land on an end-of-day deadline

const HE_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
const HE_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const pad = (n: number) => String(n).padStart(2, "0");

// Pure calendar arithmetic on the *displayed* wall clock — never an instant, so
// a plain local Date is intentional (and matches what datetime-local speaks).
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}
function displayHe(ymd: string, withYear = false): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  return `${d} ב${HE_MONTHS[mo - 1]}${withYear ? ` ${y}` : ""}`;
}
function previewHe(ymd: string, time: string): string | null {
  const [y, mo, d] = ymd.split("-").map(Number);
  if (!y || !mo || !d) return null;
  const weekday = new Date(y, mo - 1, d).getDay();
  return `התחזית תיסגר ביום ${HE_WEEKDAYS[weekday]}, ${d} ב${HE_MONTHS[mo - 1]} ${y} בשעה ${time}`;
}

interface QuickPick {
  key: string;
  label: string;
  date: string; // YYYY-MM-DD
  display: string;
  recommended?: boolean;
}

export function DateTimeField({ value, onChange, min }: DateTimeFieldProps) {
  const reduce = useReducedMotion();
  const hydrated = useHydrated();

  // now-relative dates are client-only (the host tz isn't the user's on SSR).
  const picks = useMemo<QuickPick[]>(() => {
    if (!hydrated) return [];
    const now = new Date();
    const week = toYMD(addDays(now, 7));
    const month = toYMD(addMonths(now, 1));
    const list: QuickPick[] = [
      { key: "week", label: "עוד שבוע", date: week, display: displayHe(week) },
      { key: "month", label: "עוד חודש", date: month, display: displayHe(month), recommended: true },
    ];
    if (ELECTION_DATE) {
      list.push({ key: "election", label: "יום הבחירות", date: ELECTION_DATE, display: displayHe(ELECTION_DATE, true) });
    }
    return list;
  }, [hydrated]);

  const selectedDate = value.slice(0, 10);
  const selectedTime = value.slice(11, 16);
  const preview = selectedDate && selectedTime ? previewHe(selectedDate, selectedTime) : null;

  function choose(ymd: string) {
    onChange(`${ymd}T${selectedTime || DEFAULT_TIME}`);
  }

  const rowVariants = {
    hidden: {},
    show: { transition: reduce ? {} : { staggerChildren: 0.06 } },
  };
  const itemVariants = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0 },
  };
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 480, damping: 38 };

  return (
    <div className="space-y-3">
      {picks.length > 0 && (
        <motion.div
          variants={rowVariants}
          initial="hidden"
          animate="show"
          className={`grid gap-2 ${picks.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}
          role="group"
          aria-label="בחירה מהירה של מועד"
        >
          {picks.map((p) => {
            const active = selectedDate === p.date;
            return (
              <motion.button
                key={p.key}
                type="button"
                variants={itemVariants}
                onClick={() => choose(p.date)}
                aria-pressed={active}
                whileHover={reduce ? undefined : { y: -2 }}
                whileTap={reduce ? undefined : { scale: 0.96 }}
                className={`relative isolate flex flex-col items-center gap-0.5 rounded-xl border px-2 py-3 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "border-primary text-primary-foreground"
                    : `border-border text-foreground hover:border-primary/60 ${p.recommended ? "ring-1 ring-primary/40" : ""}`
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="quick-pick-active"
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 rounded-xl bg-primary"
                    transition={spring}
                  />
                )}
                {p.recommended && (
                  <span
                    className={`absolute -top-2 end-2 rounded-full px-1.5 py-px text-[10px] font-bold ${
                      active ? "bg-card text-primary" : "bg-primary text-primary-foreground"
                    }`}
                  >
                    מומלץ
                  </span>
                )}
                <span className="text-sm font-bold">{p.label}</span>
                <span className={`nums text-xs ${active ? "text-primary-foreground/85" : "text-muted-foreground"}`}>
                  {p.display}
                </span>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      <div>
        <label className="mb-1 block text-xs font-bold text-muted-foreground" htmlFor="wclose">
          או בחרו תאריך ושעה מדויקים
        </label>
        <input
          id="wclose"
          type="datetime-local"
          dir="ltr"
          required
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${FIELD} text-start`}
        />
      </div>

      <AnimatePresence mode="wait">
        {preview && (
          <motion.p
            key={preview}
            role="status"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="text-xs font-semibold text-primary"
          >
            {preview}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
