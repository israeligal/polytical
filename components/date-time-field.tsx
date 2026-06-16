"use client";

// "When is it decided?" split into a native date field + a native time field.
// Deliberately native <input type="date"|"time">: on mobile they open the OS
// wheel/calendar (the best touch date-entry there is) and on desktop they're
// directly typeable — exactly the "people can just enter it" brief. We only
// dress them in the form's look and add a Hebrew confirmation line; the pickers
// themselves stay native so they behave perfectly on every device.
//
// Emits the same `YYYY-MM-DDTHH:mm` local-wall-clock string the old
// datetime-local produced (so `new Date(value).toISOString()` upstream is
// unchanged). Fully controlled — date and time are derived straight from
// `value`. Touching one field auto-completes the other (a new date defaults to
// an end-of-day deadline; a new time defaults the date to today) so `value` is
// always either whole or empty, which keeps the wizard's "can advance" gate
// honest without any local mirror state.

import { useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Calendar, Clock } from "@/components/icons";

export interface DateTimeFieldProps {
  /** `YYYY-MM-DDTHH:mm` or "" */
  value: string;
  onChange: (next: string) => void;
  /** Earliest allowed instant as a `YYYY-MM-DDTHH:mm` local string (now). */
  min?: string;
}

const FIELD =
  "w-full rounded-lg border border-border bg-card ps-3 pe-3 py-2.5 text-base text-foreground outline-none transition-colors focus:border-primary";
const SUBLABEL = "mb-1 flex items-center gap-1.5 text-xs font-bold text-muted-foreground";

const HE_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
const HE_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// Date math here is pure calendar arithmetic on the *displayed* wall clock — it
// never crosses into an instant/timezone, so plain local Date is intentional.
function previewHe(date: string, time: string): string | null {
  const [y, mo, d] = date.split("-").map(Number);
  if (!y || !mo || !d) return null;
  const weekday = new Date(y, mo - 1, d).getDay();
  return `התחזית תיסגר ביום ${HE_WEEKDAYS[weekday]}, ${d} ב${HE_MONTHS[mo - 1]} ${y} בשעה ${time}`;
}

const DEFAULT_TIME = "23:59"; // a new date defaults to an end-of-day deadline

export function DateTimeField({ value, onChange, min }: DateTimeFieldProps) {
  const reduce = useReducedMotion();
  const ids = useId();
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  const minDate = min?.slice(0, 10);
  const minTime = min?.slice(11, 16);

  function onDateChange(d: string) {
    onChange(d ? `${d}T${time || DEFAULT_TIME}` : "");
  }
  function onTimeChange(t: string) {
    const d = date || minDate;
    onChange(t && d ? `${d}T${t}` : "");
  }

  const preview = date && time ? previewHe(date, time) : null;

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={SUBLABEL} htmlFor={`${ids}-date`}>
            <Calendar className="h-3.5 w-3.5" /> תאריך
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            dir="ltr"
            required
            min={minDate}
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className={`${FIELD} text-start`}
          />
        </div>
        <div>
          <label className={SUBLABEL} htmlFor={`${ids}-time`}>
            <Clock className="h-3.5 w-3.5" /> שעה
          </label>
          <input
            id={`${ids}-time`}
            type="time"
            dir="ltr"
            required
            min={date && minDate && date === minDate ? minTime : undefined}
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className={`${FIELD} text-start`}
          />
        </div>
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
            className="mt-2 text-xs font-semibold text-primary"
          >
            {preview}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
