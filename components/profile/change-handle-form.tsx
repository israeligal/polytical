"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HANDLE_RE, normalizeHandle } from "@/app/lib/onboarding/handle";
import {
  changeHandleAction as defaultChangeHandleAction,
  checkHandleAction as defaultCheckHandleAction,
  generateHandleAction as defaultGenerateHandleAction,
} from "@/app/actions/onboarding";

type Availability = { available: boolean; reason?: "invalid" | "taken" | "rate_limited" } | null;

/** Actions are injectable (defaulting to the real ones) so Storybook + tests can
 *  drive the flow without a live server — same `_`-prefixed convention as QuestionDeck. */
export type ChangeHandleFormProps = {
  currentHandle: string;
  _checkHandleAction?: typeof defaultCheckHandleAction;
  _changeHandleAction?: typeof defaultChangeHandleAction;
  _generateHandleAction?: typeof defaultGenerateHandleAction;
};

/**
 * Profile control to change the public @handle. Collapsed to a single "ערכו כינוי"
 * button; expands to an editor that mirrors the onboarding wizard's handle step —
 * debounced availability via checkHandleAction, a 🎲 reroll, and a save through
 * changeHandleAction. Identity is the handle only (never the real name).
 *
 * `availSeq` is a monotonic ticket: clearTimeout can't cancel an already-dispatched
 * check, and a reroll can race a typed check (and vice versa), so every writer takes
 * a ticket and a response that lost the race is dropped instead of clobbering state.
 */
export function ChangeHandleForm({
  currentHandle,
  _checkHandleAction = defaultCheckHandleAction,
  _changeHandleAction = defaultChangeHandleAction,
  _generateHandleAction = defaultGenerateHandleAction,
}: ChangeHandleFormProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState(currentHandle);
  const [avail, setAvail] = useState<Availability>(null);
  const [checking, setChecking] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const availSeq = useRef(0);

  const normalized = normalizeHandle(handle);
  const formatOk = HANDLE_RE.test(normalized);
  const unchanged = normalized === normalizeHandle(currentHandle);
  const canSubmit = formatOk && !unchanged && avail?.available === true && !checking;

  function open() {
    setHandle(currentHandle);
    setAvail(null);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    if (debounce.current) clearTimeout(debounce.current);
    availSeq.current++; // drop any in-flight verdict
    setChecking(false);
    setError(null);
    setEditing(false);
  }

  function onChange(raw: string) {
    const ticket = ++availSeq.current;
    setHandle(raw);
    setError(null);
    setAvail(null);
    if (debounce.current) clearTimeout(debounce.current);
    const norm = normalizeHandle(raw);
    if (norm === normalizeHandle(currentHandle)) return; // unchanged — don't flag free/taken
    if (!HANDLE_RE.test(norm)) {
      if (norm.length > 0) setAvail({ available: false, reason: "invalid" });
      return;
    }
    setChecking(true);
    debounce.current = setTimeout(() => {
      void _checkHandleAction({ handle: raw }).then((res) => {
        if (availSeq.current !== ticket) return; // input changed since — stale verdict
        setAvail(res);
        setChecking(false);
      });
    }, 350);
  }

  function reroll() {
    const ticket = ++availSeq.current;
    setRolling(true);
    setError(null);
    if (debounce.current) clearTimeout(debounce.current);
    setChecking(false);
    _generateHandleAction()
      .then((res) => {
        if (availSeq.current !== ticket) return; // user typed since — keep their input
        if (res.ok && res.handle) {
          setHandle(res.handle);
          setAvail({ available: true }); // server only returns unclaimed handles
        } else {
          setError(res.message ?? "אירעה שגיאה");
        }
      })
      .catch(() => {
        if (availSeq.current === ticket) setError("אירעה שגיאה — נסו שוב");
      })
      .finally(() => setRolling(false));
  }

  function save() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await _changeHandleAction({ handle });
      if (res.ok) {
        setEditing(false);
        router.refresh(); // re-render the RSC header + profile with the new handle
      } else {
        setError(res.message ?? "אירעה שגיאה");
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        className="mt-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        ערכו כינוי
      </button>
    );
  }

  return (
    <div className="mt-3 max-w-sm">
      <label htmlFor="change-handle" className="mb-1.5 block text-xs font-bold text-muted-foreground">
        כינוי חדש
      </label>
      <div className="flex items-center gap-2 rounded-[14px] border-2 border-border bg-background px-3 py-2.5 focus-within:border-primary">
        <span className="font-display text-lg text-muted-foreground">@</span>
        <input
          id="change-handle"
          type="text"
          dir="auto"
          value={handle}
          onChange={(e) => onChange(e.target.value)}
          placeholder="your_handle"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-start text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={reroll}
          disabled={rolling || pending}
          aria-label="הגרילו כינוי"
          title="הגרילו כינוי"
          className="shrink-0 rounded-lg px-1.5 py-1 text-lg transition-transform hover:scale-110 disabled:opacity-50"
        >
          🎲
        </button>
      </div>

      <div className="mt-2 min-h-5 text-sm">
        {checking && <span className="text-muted-foreground">בודק זמינות…</span>}
        {!checking && avail?.available && (
          <span className="font-semibold text-positive">
            <bdi>@{normalized}</bdi> פנוי ✓
          </span>
        )}
        {!checking && avail && !avail.available && avail.reason === "rate_limited" && (
          <span className="font-medium text-muted-foreground">רגע, נסו שוב עוד רגע…</span>
        )}
        {!checking && avail && !avail.available && avail.reason !== "rate_limited" && (
          <span className="font-semibold text-negative">
            {avail.reason === "taken" ? "הכינוי תפוס — בחרו אחר" : "3–20 תווים, עברית או אנגלית בלי לערבב"}
          </span>
        )}
      </div>

      {error && <p className="mt-1 text-sm font-semibold text-negative">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!canSubmit || pending}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? "שומר…" : "שמרו"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="rounded-full border border-border px-5 py-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
