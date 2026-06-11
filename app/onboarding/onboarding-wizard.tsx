"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Category } from "@/lib/types";
import { HANDLE_RE, normalizeHandle } from "@/app/lib/onboarding/handle";
import {
  setHandleAction,
  checkHandleAction,
  completeOnboardingAction,
  generateHandleAction,
} from "@/app/actions/onboarding";
import { PolyticalLogo, Crest, type Suit } from "@/components/icons";

const ARENA_SUITS: Suit[] = ["knesset", "ballot", "podium", "mandate"];

type Arena = { key: Category; he: string };
type Availability = { available: boolean; reason?: "invalid" | "taken" | "rate_limited" } | null;

// Single-route, three-step identity wizard. Step state is local (derive, don't
// sync); the gate itself is authoritative on the server (page + proxy).
export function OnboardingWizard({
  arenas,
  initialHandle,
  displayName,
}: {
  arenas: Arena[];
  initialHandle: string;
  displayName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 1 — handle
  const [handle, setHandle] = useState(initialHandle);
  const [avail, setAvail] = useState<Availability>(initialHandle ? { available: true } : null);
  const [checking, setChecking] = useState(false);
  const [rolling, setRolling] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic guard: `avail` must describe the CURRENT input. clearTimeout
  // can't cancel an already-dispatched check, and a reroll can race a typed
  // check (and vice versa) — every writer takes a ticket and a stale response
  // that lost the race is dropped instead of clobbering fresher state.
  const availSeq = useRef(0);

  // Step 2 — arena
  const [arena, setArena] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const normalized = normalizeHandle(handle);
  const formatOk = HANDLE_RE.test(normalized);
  const canSubmitHandle = formatOk && avail?.available === true && !checking;

  function onHandleChange(raw: string) {
    const ticket = ++availSeq.current;
    setHandle(raw);
    setError(null);
    setAvail(null);
    if (debounce.current) clearTimeout(debounce.current);
    const norm = normalizeHandle(raw);
    if (!HANDLE_RE.test(norm)) {
      if (norm.length > 0) setAvail({ available: false, reason: "invalid" });
      return;
    }
    setChecking(true);
    debounce.current = setTimeout(() => {
      void checkHandleAction({ handle: raw }).then((res) => {
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
    generateHandleAction()
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

  function submitHandle() {
    if (!canSubmitHandle) return;
    setError(null);
    startTransition(async () => {
      const res = await setHandleAction({ handle });
      if (res.ok) setStep(1);
      else setError(res.message ?? "אירעה שגיאה");
    });
  }

  function finish() {
    if (!arena) return;
    setError(null);
    startTransition(async () => {
      const res = await completeOnboardingAction({ arena });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(res.message ?? "אירעה שגיאה");
      }
    });
  }

  return (
    <div className="rounded-card border border-border bg-card p-6 shadow-3 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <PolyticalLogo className="h-10 w-10" />
        <div>
          <p className="font-accent text-xs font-bold text-primary">ברוכים הבאים, {displayName}</p>
          <h1 className="font-display text-2xl text-foreground">בואו נתחיל</h1>
        </div>
      </div>

      {/* step dots */}
      <div className="mb-7 flex items-center gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>

      {step === 0 && (
        <section>
          <h2 className="font-display text-xl text-foreground">בחרו כינוי</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            לא אוהבים את הכינוי שהגרלנו? גלגלו 🎲 או כתבו משלכם. עברית או אנגלית: אותיות, ספרות וקו תחתון (3–20 תווים).
          </p>
          <div className="mt-4">
            <div className="flex items-center gap-2 rounded-[14px] border-2 border-border bg-background px-3 py-2.5 focus-within:border-primary">
              <span className="font-display text-lg text-muted-foreground">@</span>
              <input
                type="text"
                dir="auto"
                value={handle}
                onChange={(e) => onHandleChange(e.target.value)}
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
                <span className="font-semibold text-positive"><bdi>@{normalized}</bdi> פנוי ✓</span>
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
          </div>
          {error && <p className="mt-2 text-sm font-semibold text-negative">{error}</p>}
          <button
            type="button"
            onClick={submitHandle}
            disabled={!canSubmitHandle || pending}
            className="mt-5 w-full rounded-full bg-primary px-4 py-3 font-display text-lg text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "שומר…" : "המשך"}
          </button>
        </section>
      )}

      {step === 1 && (
        <section>
          <h2 className="font-display text-xl text-foreground">מה מעניין אתכם?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            בחרו את הזירה שהכי בוערת לכם — נמליץ עליה לכם בפיד.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {arenas.map((a, i) => {
              const active = arena === a.key;
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setArena(a.key)}
                  aria-pressed={active}
                  className={`flex items-center gap-2.5 rounded-[14px] border-2 px-3 py-3 text-start font-bold transition-all ${
                    active
                      ? "border-primary bg-primary/10 text-foreground shadow-glow-mint"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  <Crest suit={ARENA_SUITS[i % ARENA_SUITS.length]} className="h-5 w-5 shrink-0" />
                  <span>{a.he}</span>
                </button>
              );
            })}
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-negative">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => { setError(null); setStep(0); }}
              className="rounded-full border border-border px-5 py-3 font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              חזרה
            </button>
            <button
              type="button"
              onClick={() => arena && setStep(2)}
              disabled={!arena}
              className="flex-1 rounded-full bg-primary px-4 py-3 font-display text-lg text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              המשך
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-accent/15 text-accent shadow-glow-gold">
            <PolyticalLogo className="h-9 w-9" />
          </div>
          <h2 className="font-display text-2xl text-foreground">הכול מוכן, <bdi>@{normalized}</bdi></h2>
          <p className="mt-2 text-sm text-muted-foreground">
            הגיע הזמן <span className="font-bold text-gold">לתת מנדט</span>. בחרו תוצאה בכל תחזית,
            אספו קלפים לפי הדיוק שלכם, וטפסו בטבלת המובילים.
          </p>
          {error && <p className="mt-3 text-sm font-semibold text-negative">{error}</p>}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => { setError(null); setStep(1); }}
              className="rounded-full border border-border px-5 py-3 font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              חזרה
            </button>
            <button
              type="button"
              onClick={finish}
              disabled={pending}
              className="flex-1 rounded-full bg-accent px-4 py-3 font-display text-lg text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "מתחילים…" : "יאללה, מתחילים"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
