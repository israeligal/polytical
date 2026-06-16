import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Sparkle } from "@/components/icons";

/**
 * Exploration only — NOT shipped. Five candidate treatments for the wizard's
 * plaintext inputs (the "שאלת התחזית" / source fields), so we can pick a look
 * before committing one. All RTL, tokens-only (mint accent shows as the theme's
 * primary), logical properties, reduced-motion aware. Type into each to feel
 * the focus motion. Pick a number and I'll extract it into a real component and
 * roll it across the wizard.
 */

const LABEL = "שאלת התחזית";
const PLACEHOLDER = "קצר וחד: ״מי יוביל את הליכוד בבחירות הבאות?״";
const SUBLABEL = "mb-1.5 block text-xs font-bold text-muted-foreground";

interface FieldProps {
  value: string;
  onChange: (v: string) => void;
}

/* 1 — Minimal underline: no box, a mint underline springs in from center. */
function UnderlineInput({ value, onChange }: FieldProps) {
  const reduce = useReducedMotion();
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <span className={SUBLABEL}>{LABEL}</span>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={PLACEHOLDER}
          className="w-full border-0 border-b border-border bg-transparent px-0 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground/55"
        />
        <motion.span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 origin-center rounded-full bg-primary"
          initial={false}
          animate={{ scaleX: focused ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
        />
      </div>
    </div>
  );
}

/* 2 — Soft filled: borderless sunken well, mint ring glow on focus. */
function SoftFilledInput({ value, onChange }: FieldProps) {
  return (
    <div>
      <span className={SUBLABEL}>{LABEL}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER}
        className="w-full rounded-xl border border-transparent bg-sunken px-4 py-3 text-base text-foreground outline-none transition-shadow placeholder:text-muted-foreground/55 focus:border-primary focus:ring-4 focus:ring-primary/15"
      />
    </div>
  );
}

/* 3 — Floating label: label rides inside, lifts + shrinks on focus/fill. */
function FloatingLabelInput({ value, onChange }: FieldProps) {
  const reduce = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const float = focused || value.length > 0;
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={float ? PLACEHOLDER : ""}
        className={`w-full rounded-lg border bg-card px-3 pb-2.5 pt-6 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 ${
          focused ? "border-primary" : "border-border"
        }`}
      />
      <motion.span
        aria-hidden
        className={`pointer-events-none absolute start-3 top-0 origin-[right_top] font-bold ${
          focused ? "text-primary" : "text-muted-foreground"
        }`}
        initial={false}
        animate={{ y: float ? 7 : 18, scale: float ? 0.78 : 1 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 36 }}
      >
        {LABEL}
      </motion.span>
    </div>
  );
}

/* 4 — Elevated card: leading icon, lifts on focus with a softer shadow. */
function ElevatedInput({ value, onChange }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <span className={SUBLABEL}>{LABEL}</span>
      <div
        className={`flex items-center gap-2.5 rounded-xl border bg-card ps-3 pe-3 py-2.5 transition-all duration-200 ${
          focused ? "-translate-y-0.5 border-primary shadow-md" : "border-border shadow-sm"
        }`}
      >
        <Sparkle className={`h-5 w-5 shrink-0 transition-colors ${focused ? "text-primary" : "text-muted-foreground/70"}`} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={PLACEHOLDER}
          className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/55"
        />
      </div>
    </div>
  );
}

/* 5 — Bold display: large, heavy, thick border — makes the question feel big. */
function BoldDisplayInput({ value, onChange }: FieldProps) {
  return (
    <div>
      <span className={SUBLABEL}>{LABEL}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER}
        className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3.5 text-lg font-bold text-foreground outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground/45 focus:border-primary"
      />
    </div>
  );
}

const VARIANTS: { n: number; name: string; note: string; Comp: (p: FieldProps) => React.ReactElement }[] = [
  { n: 1, name: "קו תחתון מינימלי", note: "בלי תיבה — קו מנטה שנפתח במיקוד. נקי ועיתונאי.", Comp: UnderlineInput },
  { n: 2, name: "מילוי רך", note: "באר שקועה בלי מסגרת, הילה רכה במיקוד. ידידותי ומודרני.", Comp: SoftFilledInput },
  { n: 3, name: "תווית צפה", note: "התווית יושבת בפנים ועולה במיקוד. מלוטש וחוסך מקום.", Comp: FloatingLabelInput },
  { n: 4, name: "כרטיס מורם", note: "אייקון מוביל + הצללה שמתרוממת במיקוד. תחושת פרימיום.", Comp: ElevatedInput },
  { n: 5, name: "בולט וגדול", note: "טקסט גדול ומודגש, מסגרת עבה. הופך את השאלה לחשובה.", Comp: BoldDisplayInput },
];

function Gallery({ seedFilled }: { seedFilled: boolean }) {
  return (
    <div dir="rtl" className="mx-auto w-full max-w-xl space-y-7 px-4 py-8">
      <header>
        <h2 className="font-display text-2xl font-black text-foreground">סגנונות שדה קלט</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          חמש אפשרויות לשדה הטקסט בוויזרד. הקלידו בכל אחד כדי להרגיש את האנימציה במיקוד. בחרו מספר ואכניס אותו לוויזרד.
        </p>
      </header>
      {VARIANTS.map(({ n, name, note, Comp }) => (
        <Variant key={n} n={n} name={name} note={note} Comp={Comp} seedFilled={seedFilled} />
      ))}
    </div>
  );
}

function Variant({
  n,
  name,
  note,
  Comp,
  seedFilled,
}: {
  n: number;
  name: string;
  note: string;
  Comp: (p: FieldProps) => React.ReactElement;
  seedFilled: boolean;
}) {
  const [value, setValue] = useState(seedFilled ? "מי יוביל את הליכוד בבחירות הבאות?" : "");
  return (
    <section className="rounded-2xl border border-border/70 bg-card/40 p-5">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground">
          {n}
        </span>
        <h3 className="text-sm font-black text-foreground">{name}</h3>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
      <Comp value={value} onChange={setValue} />
    </section>
  );
}

const meta = {
  title: "Forms/Input Explorations",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty — compare placeholder + resting state. */
export const Empty: Story = { render: () => <Gallery seedFilled={false} /> };
/** Filled — compare how a real question reads in each. */
export const Filled: Story = { render: () => <Gallery seedFilled /> };
