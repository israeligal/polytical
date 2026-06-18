"use client";
import { useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { Category } from "@/lib/types";
import { HANDLE_RE, normalizeHandle } from "@/app/lib/onboarding/handle";
import { MAX_ARENAS } from "@/app/lib/onboarding/arenas";
import {
  setHandleAction,
  checkHandleAction,
  completeOnboardingAction,
  generateHandleAction,
} from "@/app/actions/onboarding";
import { PolyticalLogo, Crest, type Suit } from "@/components/icons";
import { CaricatureEditor } from "@/components/profile/caricature-editor";

const ARENA_SUITS: Suit[] = ["knesset", "ballot", "podium", "mandate"];

type Arena = { key: Category; he: string };
type Availability = { available: boolean; reason?: "invalid" | "taken" | "rate_limited" } | null;

// Single-route, three-step identity wizard. Step state is local (derive, don't
// sync); the gate itself is authoritative on the server (page + proxy).
export function OnboardingWizard({
  arenas,
  initialHandle,
}: {
  arenas: Arena[];
  initialHandle: string;
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

  // Step 2 — focus categories (1..MAX_ARENAS). Each pick lights its own color.
  const [selected, setSelected] = useState<string[]>([]);
  const toggleArena = (key: string) =>
    setSelected((prev) =>
      prev.includes(key)
        ? prev.filter((k) => k !== key)
        : prev.length < MAX_ARENAS
          ? [...prev, key]
          : prev, // at cap — ignore extra picks (deselect one first)
    );

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
    if (selected.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await completeOnboardingAction({ arenas: selected });
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
          <p className="font-accent text-xs font-bold text-primary">ברוכים הבאים לפוליטיקל</p>
          <h1 className="font-display text-2xl text-foreground">בואו נתחיל</h1>
        </div>
      </div>

      {/* step dots */}
      <div className="mb-7 flex items-center gap-2" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
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
            בחרו עד {MAX_ARENAS} זירות שהכי בוערות לכם — נמליץ עליהן בפיד שלכם. כל בחירה נדלקת בצבע משלה.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {arenas.map((a, i) => {
              const active = selected.includes(a.key);
              const atCap = selected.length >= MAX_ARENAS;
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => toggleArena(a.key)}
                  aria-pressed={active}
                  // Each category lights in its own hue (theme-aware --cat-N token),
                  // plumbed via --aura so the static utility classes can read it.
                  style={{ "--aura": `var(--cat-${i + 1})` } as CSSProperties}
                  className={`relative flex items-center gap-2.5 rounded-[14px] border-2 px-3 py-3 text-start font-bold transition-all duration-200 motion-reduce:transition-none ${
                    active
                      ? "border-[color:var(--aura)] bg-[color-mix(in_oklab,var(--aura)_14%,transparent)] text-foreground shadow-[0_0_26px_-6px_var(--aura)]"
                      : atCap
                        ? "border-border bg-background text-muted-foreground opacity-60"
                        : "border-border bg-background text-muted-foreground hover:border-[color:var(--aura)]"
                  }`}
                >
                  <Crest
                    suit={ARENA_SUITS[i % ARENA_SUITS.length]}
                    className={`h-5 w-5 shrink-0 transition-colors ${active ? "text-[color:var(--aura)]" : "text-muted-foreground"}`}
                  />
                  <span className="flex-1">{a.he}</span>
                  {active && (
                    <span aria-hidden="true" className="text-[color:var(--aura)] leading-none">
                      ◉
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            נבחרו <span className="nums font-bold text-foreground">{selected.length}</span> מתוך {MAX_ARENAS}
          </p>
          {error && <p className="mt-2 text-sm font-semibold text-negative">{error}</p>}
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
              onClick={() => selected.length > 0 && setStep(2)}
              disabled={selected.length === 0}
              className="flex-1 rounded-full bg-primary px-4 py-3 font-display text-lg text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              המשך
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h2 className="font-display text-xl text-foreground">אווטאר קריקטורה (רשות)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            רוצים פרצוף משלכם? צרו קריקטורה ב-Gemini והעלו אותה — אפשר גם לדלג ולהוסיף אחר כך מהפרופיל.
          </p>
          {/* defaultEditing → shown expanded; onSaved advances the wizard (a
              router.refresh() would remount the wizard and lose its state). */}
          <CaricatureEditor defaultEditing onSaved={() => setStep(3)} />
          {error && <p className="mt-2 text-sm font-semibold text-negative">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => { setError(null); setStep(1); }}
              className="rounded-full border border-border px-5 py-3 font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              חזרה
            </button>
            <button
              type="button"
              onClick={() => { setError(null); setStep(3); }}
              className="flex-1 rounded-full bg-primary px-4 py-3 font-display text-lg text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              דלגו
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
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
              onClick={() => { setError(null); setStep(2); }}
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
