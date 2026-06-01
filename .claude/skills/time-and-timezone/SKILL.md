---
name: time-and-timezone
description: Timezone and date handling patterns for shift-manager. Use when writing or reviewing code that parses dates, creates shifts, handles recurrence, compares days of week, converts between timezones, touches the AI chat route/agents, works with calendar grid dates, or constructs shift start/end times. Triggers on date bugs, off-by-one day errors, UTC/local confusion, parseISO vs parseISODate questions, toUTCMidnight usage, userDateTimeIso, calendar date key mismatches, and recurrence generation issues. Even if the task seems simple, consult this skill whenever dates or times are involved anywhere in the codebase.
---

# Timezone & Date Handling — Complete Reference (date-fns v4)

## 1. Architecture Overview

**Library**: date-fns v4 with `@date-fns/utc` (UTCDate) and `@date-fns/tz` (TZDate).
**Single import rule**: ALL date operations import from `@shift-manager/lib/time`. Never import `date-fns`, `@date-fns/utc`, or `@date-fns/tz` directly (enforced by ESLint).
**No Luxon**: Luxon was fully removed (2026-03-05). Never use `DateTime`, `Settings.defaultZone`, or any Luxon API.

```
                    Organization timezone (IANA string, e.g. "Asia/Jerusalem")
                    Stored in: Organization.timezone (Prisma schema)
                    Set once per org, used everywhere
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
   FRONTEND             BACKEND           AI CHAT
   _orgTimezone         Pure UTC          Offset from ISO
   (module var set      (Date.UTC,        ("+02:00" regex
   via setDefault-      getUTC*())        from userDateTimeIso)
   Timezone on load)
```

## 2. How It Works Internally

**Module-level state** (`src/time/config.ts`): `_orgTimezone` variable (not global). Defaults to system timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`.

**TZDate wrapping** (`src/time/internal.ts`): `_toTZDate(date, tz?)` creates a `TZDate` in the configured org timezone. Used by formatting functions and component getters (`getDay`, `getMonth`, etc.).

**Type-preserving**: Boundary functions (`startOfMonth`, `endOfDay`, etc.) pass dates through as-is — `UTCDate→UTC`, `TZDate→tz`, `Date→local`. Arithmetic functions (`addDays`, `subWeeks`) use `UTCDate` internally for timezone-safe math.

**Format tokens**: date-fns syntax — `EEE` (short day), `EEEE` (full day), `zzz` (tz abbrev), `xxx` (tz offset).

## 3. Timezone Lifecycle

### Frontend Initialization
```
layout.tsx
  └─ <TimezoneProviderWrapper>
       ├─ useOrganizationSettings() → { timezone }
       └─ <TimezoneProvider timezone={timezone}>
            └─ useEffect → setDefaultTimezone(timezone)  (sets _orgTimezone)
```

**Before org loads**: `_orgTimezone` is system timezone (Intl API). Calendar grid local-midnight helpers avoid this issue.

### Backend — No Global Zone
Backend uses explicit UTC methods (`Date.UTC()`, `getUTC*()`) or passes timezone explicitly to `toUTC()`, `fromUTC()`, `startOfDayInTz()`.

### AI Chat — Timezone via Request Context
```
Frontend POST /api/chat → route.ts extracts userDateTimeIso
  → requestContext.set('userDateTimeIso', "2026-03-05T12:00:00+02:00")
  → Each agent extracts tz: dt.match(/([+-]\d{2}:\d{2})$/)?.[1] ?? 'UTC'
  → Injected into prompt: "Current date: ... Timezone: +02:00"
```

## 4. Shift Creation — How Times Are Constructed

### AI Tools (setup-plan-tools.ts)
```typescript
const tzOffset = userDateTimeIso.match(/([+-]\d{2}:\d{2})$/)?.[1] ?? '+00:00'
const startDateTime = new Date(`${dateStr}T${startTime}:00${tzOffset}`)
// "2026-01-04T09:00:00+02:00" → internally stored as 2026-01-04T07:00:00.000Z

const shiftDate = new Date(Date.UTC(
  startDateTime.getUTCFullYear(), startDateTime.getUTCMonth(), startDateTime.getUTCDate()
))
```

### Recurrence Date Calculation (recurrence-calculation.service.ts)
- All dates normalized to UTC midnight via `toUTCMidnight()`
- Weekly: day-by-day iteration using `getUTCDay()`, millisecond-based day addition
- Monthly: `Date.UTC(year, month, dayOfMonth)`, validates with `getUTCDate()` for overflow
- Returns array of UTC midnight `Date` objects

### Recurrence Shift Generation (recurrence-generation.service.ts)
`applyTemplateTimesToDate()` copies UTC hours/minutes from template to target date — all UTC, no timezone conversion.

## 5. Frontend Calendar — The Local-Midnight Exception

Calendar grid dates are `new Date(year, month, day)` — **local browser midnight**. These must NOT be passed to standard time helpers.

### The Bug
Standard helpers (`getDay`, `format`, `startOfWeek`) route through `_toTZDate()` using `_orgTimezone`. Before org loads (or when default is UTC), this shifts the day backwards in UTC+ timezones.

Example in Israel (UTC+2): `new Date(2026, 2, 1)` (local Sunday midnight) → TZDate in UTC sees `2026-02-28T22:00Z` → reports Saturday.

### The Fix — Local-Date Helpers
```typescript
import { getLocalDay, formatLocal, localStartOfWeek, isLocalWeekend } from '@shift-manager/lib/time'
```

| Standard (for UTC/API dates) | Local (for calendar grid dates) | Implementation |
|---|---|---|
| `getDay(date)` | `getLocalDay(date)` | `date.getDay()` (native) |
| `format(date, fmt)` | `formatLocal(date, fmt)` | date-fns format with system zone |
| `startOfWeek(date)` | `localStartOfWeek(date)` | date-fns with system zone |
| `isWeekend()` check | `isLocalWeekend(date)` | `date.getDay()` (native) |

### Date Key Matching
```typescript
// Calendar grid: getLocalDateKey() → "2026-01-01" (from getFullYear/getMonth/getDate)
// Shift API:     ShiftDTO.startDateTime → "2026-01-01T00:00:00.000Z" (full ISO)
// Shift→cell:    getZonedDateKey({date: new Date(shift.startDateTime), timezone}) → "2026-01-01"
//                Use org timezone — UTC-based keying mis-attributes early-morning shifts
//                (01:00 IST = 22:00 UTC the previous day) to the wrong calendar day.
//                See docs/decisions/timezone-boundaries.md (2026-05-23) for the contract.
// getUTCDateKey: still exported from shift-calendar/utils/dateHelpers but legacy — prefer
//                getZonedDateKey for any new shift→cell derivation.
```

## 6. Key Functions Quick Reference

| Function | Zone | Use For |
|---|---|---|
| `setDefaultTimezone(tz)` | Sets _orgTimezone | App init (TimezoneProvider) |
| `getMyTimeZone()` | Reads _orgTimezone | Display current timezone |
| `guessLocalTimeZone()` | Browser Intl API | Fallback detection |
| `parseISODate(str)` | Forces UTC midnight | Date-only strings ("2026-02-28") |
| `parseISO(str)` | Standard parse | Full ISO datetime strings |
| `toUTCMidnight(date)` | UTC getters | Recurrence date normalization |
| `toUTC(date, tz)` | tz → UTC | User input to storage |
| `fromUTC(date, tz)` | UTC → tz | Storage to display |
| `startOfDayInTz(date, tz)` | tz → UTC | Date range queries |
| `getZonedDateKey({date, tz})` | UTC instant → org-local YYYY-MM-DD | Shift→calendar-cell attribution (replaces `getUTCDateKey`) |
| `endOfDayInTz(date, tz)` | tz → UTC | Date range queries |
| `format(date, fmt)` | _orgTimezone via TZDate | General display (UTC/API dates) |
| `formatInTz(date, fmt, tz)` | Explicit tz | Format UTC in specific timezone |
| `formatLocal(date, fmt)` | Browser system | Calendar grid dates only |
| `getDay(date)` | _orgTimezone via TZDate | Day-of-week for API/UTC dates |
| `getLocalDay(date)` | Browser local | Day-of-week for calendar grid |
| `localStartOfWeek(date)` | Browser local | Calendar grid week start |
| `isLocalWeekend(date)` | Browser local | Calendar grid weekend check |
| `datetimeLocalToUTC(val, tz)` | tz → UTC | `<input type="datetime-local">` |
| `utcToDatetimeLocal(date, tz)` | UTC → tz | Pre-fill datetime inputs |
| `addDays/Months/Hours/etc.` | UTCDate internally | Date arithmetic (safe everywhere) |

## 7. Day-of-Week Convention

JS convention: `0=Sun, 1=Mon, ..., 6=Sat`. The `getDay()` helper wraps `TZDate` and returns this convention.

Recurrence encoding: `ScheduleEntry.dayOfWeek` uses **offset encoding** — 0-6 = weekly (Sun-Sat), 101-131 = monthly (dayOfMonth + 100).

## 8. Common Mistakes

### Using `parseISO()` for date-only strings
```typescript
// WRONG — timezone shift causes off-by-one
parseISO("2026-02-28")  // → could be 2026-02-27T22:00:00Z in UTC+2
// CORRECT
parseISODate("2026-02-28")  // → always 2026-02-28T00:00:00.000Z
```

### `new Date(year, month, day)` in backend code
```typescript
// WRONG — local timezone midnight
new Date(2026, 1, 28)
// CORRECT — UTC midnight
new Date(Date.UTC(2026, 1, 28))
```

### Standard helpers on calendar grid dates
```typescript
const gridDate = new Date(2026, 2, 1)  // local midnight
getDay(gridDate)      // WRONG — off-by-one in UTC+
getLocalDay(gridDate) // CORRECT — uses native .getDay()
```

### Importing date-fns directly
```typescript
// WRONG — bypasses org timezone and conventions
import { format } from 'date-fns'
// CORRECT — all imports from centralized module
import { format } from '@shift-manager/lib/time'
```

## 9. Code Review Checklist

- [ ] Date-only strings use `parseISODate()`, not `parseISO()`
- [ ] Backend date construction uses `Date.UTC()`, not `new Date(y, m, d)`
- [ ] `toUTCMidnight()` receives UTC-based dates
- [ ] UTC/API dates use `getDay()`, `format()`, `startOfWeek()`
- [ ] Local-midnight dates use `getLocalDay()`, `formatLocal()`, `localStartOfWeek()`, `isLocalWeekend()`
- [ ] All imports come from `@shift-manager/lib/time`
- [ ] No direct `.getDay()`, `.getDate()`, `.getMonth()` on Date objects in backend (use helpers)
- [ ] Timezone conversions use `toUTC()`/`fromUTC()` at API boundaries
- [ ] AI tools extract tz offset from `userDateTimeIso`, not from a global zone
- [ ] Shift date keys normalized before Map lookups via `getZonedDateKey({date, timezone})` from `@shift-manager/lib/time` (UTC-based keying via `.slice(0,10)` / `getUTCDateKey()` is legacy — mis-attributes cross-midnight shifts)
- [ ] Recurrence dates flow through `getAllDatesInRange()` → UTC midnight array

## 10. Key Files

| File | Role |
|---|---|
| `packages/core/lib/src/time/` | Central time utilities (12 files) |
| `packages/core/lib/src/time/config.ts` | `_orgTimezone` module variable, `setDefaultTimezone()` |
| `packages/core/lib/src/time/internal.ts` | `_toDate()`, `_toTZDate()` internal helpers |
| `packages/core/lib/src/time/format.ts` | `format()`, `formatInTz()`, `DATE_FORMATS` |
| `packages/core/lib/src/time/components.ts` | `getDay()`, `getMonth()`, etc. via TZDate |
| `packages/core/lib/src/time/local.ts` | `getLocalDay()`, `formatLocal()` — calendar grid only |
| `packages/core/lib/src/time/timezone.ts` | `toUTC()`, `fromUTC()`, `datetimeLocalToUTC()` |
| `packages/core/lib/src/time/parse.ts` | `parseISO()`, `parseISODate()`, `parse()` |
| `packages/core/lib/src/time/boundaries.ts` | `startOfDay()`, `endOfDay()`, etc. (type-preserving) |
| `packages/core/lib/src/time/arithmetic.ts` | `addDays()`, `subWeeks()`, etc. (UTCDate internally) |
| `packages/core/lib/src/components/timezone-provider.tsx` | Sets _orgTimezone on app load |
| `apps/chat-v2/src/app/api/chat/route.ts` | Converts userTimezone → userDateTimeIso for agents |
| `packages/core/shift-calendar/src/utils/dateHelpers.ts` | `getLocalDateKey()`, `getUTCDateKey()` |
