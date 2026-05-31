# Polytical — Design System Spec  ·  "Ballot & Ink"

**Status:** Draft for review
**Owner:** Gal (gireddit@gmail.com)
**Last reviewed:** 2026-05-31
**Token layer:** `app/globals.css` · **Enforced by:** `token-lint.sh`, design review

> Source of truth for how Polytical looks. Components are built against this; design review checks against it. The look was chosen in the design-system brainstorm: **Ballot & Ink** (editorial op-ed canvas, bold caricatures as the pop).

---

## 1. Brand personality

**A satirical political op-ed page that's secretly a game: fact-grounded and credible like quality Israeli journalism, witty and irreverent through its caricatures and the thrill of calling it right.**

**Target feeling:** "I trust the facts here — and I want to prove I called it."

Every decision below traces to this sentence:
- **Credible** → warm "ballot paper" canvas, near-black ink, a serious editorial serif, crisp hairline rules, restrained motion.
- **Game / thrill** → a confident blue for action, **gold** for coins & winning, animated odds bars, payout celebration.
- **Witty / irreverent** → the AI caricatures are the loud, fun focal point against the calm canvas.

---

## 2. Color tokens

All colors **OKLCH**. Components use the semantic name (`bg-primary`), never the raw value (`bg-[#...]`). Values live in `app/globals.css`.

### Core

| Token | OKLCH | Meaning |
|---|---|---|
| `--background` | `0.985 0.008 85` | Warm ballot-paper page background |
| `--foreground` | `0.25 0.012 75` | Near-black warm ink — headings + body |
| `--card` | `0.995 0.004 90` | Card background (near-white, lifts off the cream) |
| `--primary` | `0.47 0.16 258` | Ballot blue — actions, links, active, overlines, focus |
| `--primary-foreground` | `0.99 0.005 250` | Text/icons on primary |
| `--primary-hover` | `0.42 0.16 258` | Primary hover (base L − 0.05) |
| `--accent` | `0.78 0.14 80` | **Gold** — coins, "hot"/trending/featured. **Fills & icons only** |
| `--accent-foreground` | `0.28 0.03 75` | Ink on gold |
| `--accent-hover` | `0.73 0.14 80` | Gold hover |
| `--muted` | `0.955 0.01 85` | Subdued section backgrounds, input fills |
| `--muted-foreground` | `0.46 0.02 80` | Subtitles, captions, helper text |
| `--border` | `0.89 0.012 82` | Warm hairline rules, card borders, inputs |
| `--destructive` | `0.55 0.20 27` | Errors, destructive actions |

### Outcome tokens — reserved, never decorative

The single most important color rule in a market UI: **green and red mean outcomes, nothing else.** Never use them for branding, decoration, or rhythm.

| Token | OKLCH | Meaning |
|---|---|---|
| `--positive` / `-foreground` | `0.56 0.13 152` | **YES · up · gain · win** |
| `--positive-soft` | `0.93 0.045 152` | YES bar track, positive chips |
| `--negative` / `-foreground` | `0.56 0.19 28` | **NO · down · loss** |
| `--negative-soft` | `0.93 0.05 28` | NO bar track, negative chips |

### Categorical — parties & multi-option markets

`--cat-1…8` (blue/teal/green/gold/orange/red/purple/magenta). **No inherent meaning** — assigned to a party or a multi-option outcome from data, stable per entity. Used for the caricature-card party stripe and multi-option bars. For a party not in the set, fall back to `--cat-1`. (Dynamic party color is the *one* sanctioned data-driven color: set it via a `--party` CSS variable from a central party→token map, never a raw hex in a component.)

**Rules.** Card backgrounds are always `--card`, never `--muted`. Every foreground/background pair clears **WCAG AA** (4.5:1 body, 3:1 large) — verify new pairs at webaim.org. **No dark mode in v1** (a P2; the paper aesthetic is light by design).

---

## 3. Section architecture

Polytical is app-first, but the landing page, how-it-works, and politician pages stack full-width sections. **Background = content type, never rhythm.**

| Background | When to use |
|---|---|
| `--background` (cream) | Default app surface: market feed, detail bodies, content sections |
| `--muted` (deeper cream) | Grouped/secondary bands: how-it-works steps, leaderboard band, input fills |
| `--primary` (blue) | Rare, reserved: the landing hero band and the focused "place your bet" panel only |
| `--accent` (gold) | Never a section background — fills/badges only |

**Section header pattern** (apply everywhere identically):

```
Overline → text-sm font-bold text-primary           (NO uppercase, NO letter-spacing — Hebrew)
H2       → font-display text-3xl sm:text-4xl font-bold text-foreground leading-tight
Subtitle → text-lg text-muted-foreground
```

> The generic framework uses an uppercase, wide-tracked accent overline. **Hebrew has no uppercase and tracking harms it** — so our overline is primary-blue, bold, normal-tracked, sentence-case.

**Layout constants:** max width `max-w-6xl` (app feeds `max-w-3xl` single-column) · horizontal padding `px-4 sm:px-6 lg:px-8` · vertical section padding `py-16 lg:py-24` (standard), `py-24 lg:py-32` (spacious hero).

---

## 4. Components

### Buttons — exactly two roles

Shape constant: **`rounded-lg`** (soft-rect — editorial/data, not bubbly). Sizes: `sm` (`px-3 py-1.5 text-sm`), `base` (`px-5 py-2.5 text-base`), `lg` (`px-7 py-3 text-lg`).

- **Primary** — `bg-primary text-primary-foreground font-bold`, soft shadow, hover `-translate-y-0.5` + shadow bump (~150ms). The one main action.
- **Secondary** — same shape, `border-2 border-primary text-primary`, no fill, no shadow. Obviously subordinate.

No tertiary/ghost roles. Need something lighter? Use a plain `text-primary` link. **Outcome chips and the bet button are components, not button roles** (below).

### Cards — tiered by purpose

| Tier | Use | Shape |
|---|---|---|
| **Row card** | Leaderboard rows, list entries, comments. No hover. | `rounded-lg border border-border` · no shadow · tight padding |
| **Feature card** | **Market cards** in the feed; anything clickable. Hover lift. | `rounded-xl border border-border shadow-sm` · `hover:-translate-y-1 hover:shadow-md` (~300ms `ease-out`) |
| **Container card** | The bet panel, large info/stat panels. No hover. | `rounded-2xl border border-border shadow-md` · generous padding |
| **Caricature card** | The collectible politician card — the hero artifact. | `rounded-2xl` · **2px frame in the politician's `--cat-*` party color** · `shadow-lg` · portrait + stat block |

Card background always `--card`. Hover only on the Feature tier.

### Product components (the signature surface)

- **Odds bar** — the iconic element. A horizontal bar: `--positive` segment (YES) + `--negative` segment (NO) sized to pool %, on a `--muted` track, `rounded-full`. Multi-option uses `--cat-*` segments. % labels in `.nums tabular-nums`. **Width animates** when odds move (`transition-[width] ~400ms ease-out`, reduced-motion aware).
- **Market card** (Feature tier) — category overline · question in `font-display` · odds bar · footer row: volume (`◔ coins`, gold coin glyph) + close countdown + featured politician avatar chips. Entire card links to the market.
- **Caricature card** — party-color top stripe/frame · AI caricature portrait · name in `font-display` · party tag (`--cat-*` chip) + role · **stat block** (`.nums`, label/value rows: age, in politics since, seats history, key positions) · a signature quote in serif italic. Bold, fun, the share-bait.
- **Outcome chip / toggle** — selectable YES/NO (or A/B/C/D) pills: default `border` + outcome-soft bg; selected → filled `bg-positive`/`bg-negative`/`bg-cat-*` with `-foreground` text. These are toggles, not buttons.
- **Bet panel** (Container tier) — stake input + quick-chips (10 / 50 / 100 / Max) · live "potential payout at current odds" in `.nums` · place-bet **primary** button. May sit on a `--primary` or `--muted` panel.
- **Coin / balance pill** — `bg-accent text-accent-foreground rounded-full`, gold coin glyph + `.nums` balance. The economy motif.
- **Status badge** — `closes in 3d` (muted), `HOT` (gold accent fill), `RESOLVED` (positive/negative by result), `VOID` (muted). Small `rounded-full` pills.

---

## 5. Typography

**Fonts** (via `next/font/google`, self-hosted, in `app/layout.tsx`):
- **Display — Frank Ruhl Libre** (`font-display`): the classic Hebrew newspaper serif. Op-ed headlines, market questions, politician names, section H2s.
- **Sans — Heebo** (`font-sans`, global default): UI, body, labels, all numeric data.

### App / marketing scale

| Role | Classes |
|---|---|
| H1 (hero) | `font-display font-black text-[clamp(2rem,5vw,3.5rem)] leading-[1.15]` |
| H2 (section) | `font-display font-bold text-3xl sm:text-4xl leading-tight` |
| H3 (card title / question) | `font-display font-bold text-xl` |
| Overline | `text-sm font-bold text-primary` (sentence-case, no tracking) |
| Subtitle | `text-lg text-muted-foreground` |
| Body | `text-base leading-[1.6]` |
| Caption / meta | `text-sm text-muted-foreground` |
| Data figure | `.nums tabular-nums font-semibold` |

### Content-page sub-scale (politician bio, how-it-works, guide pages)

The page H1 must win — in-article headings are deliberately smaller.

| Role | Classes |
|---|---|
| Page H1 (header band) | `font-display text-[clamp(2rem,5vw,3.5rem)]` |
| Article H2 | `font-display text-2xl font-bold` |
| Article H3 | `text-base font-bold` |
| Article body | `text-lg leading-[1.8]` (Hebrew reading comfort) |

### Hebrew / RTL rules (override the Latin-centric defaults)

- **No negative letter-spacing.** Hebrew is never tracked tight like Latin display. Global `letter-spacing: normal`.
- **No uppercase / no `uppercase` utility.** Hebrew has no case; overlines get emphasis from weight + color, not caps.
- **Slightly looser leading** (`1.6` body / `1.8` long-form) — Hebrew has tall letterforms and no ascender/descender rhythm to lean on.
- **Numerals & mixed LTR runs** stay LTR inside RTL: wrap bare figures/percentages/handles in `.nums` and, where a string mixes scripts, isolate with `<bdi>` / `dir="ltr"` so "68%" and "@handle" don't reorder.
- **Logical properties** everywhere (`ms-*`/`me-*`, `ps-*`/`pe-*`, `start`/`end`) — never hard-coded `left`/`right` — so the one codebase stays correct if an LTR locale is ever added.

---

## 6. Motion

**Restrained by default — no scroll-triggered entrance animations.** Hover feedback and *functional* market motion only.

| Element | Motion |
|---|---|
| Button hover | `-translate-y-0.5` + shadow, ~150ms |
| Feature/market card hover | `-translate-y-1` + shadow, ~300ms `ease-out` |
| Odds bar | width transition ~400ms `ease-out` when pools change |
| Coin balance | brief count-up on change; **+payout celebration** on a win |
| Status → RESOLVED | quick fade/scale; not a bounce |
| Sticky header | border/shadow appears on scroll |

This is a game, so a *little* more motion than a typical product is on-brand — but it must **explain a state change** (odds moved, you won), never just decorate. Implement with the `motion-for-react` skill. **All non-essential motion wrapped in `@media (prefers-reduced-motion: no-preference)`.**

---

## 7. Content pages

Politician detail, how-it-works, and any guide/SEO page are a separate layout system from the app feed.

- **Layout:** single centered column, `max-w-3xl`, generous leading (§5 content sub-scale).
- **Header band:** `--muted` background, page H1 in `font-display`, one-line standfirst in `--muted-foreground`.
- **Politician detail:** caricature card pinned at top, then sourced facts and the politician's markets. **Every fact cites its source** (official gov site / newsletter) inline — the credibility backbone.
- **CTA placement:** a single primary CTA at the end ("בואו לנחש" / browse their markets), never mid-article.

---

## 8. Anti-patterns (explicitly forbidden)

- **Green/red as decoration.** They mean YES/up and NO/down only. A green "submit" or red "delete" uses `--primary` / `--destructive`, not the outcome tokens.
- **Gold as text.** `--accent` is fills & icons only; gold body text fails contrast on cream.
- **Background-by-rhythm** — alternating colors for variety instead of by content type.
- **Card background == section background** — a card with no edge disappears.
- **A third button role** — use a text link instead.
- **Hover on non-interactive cards** (row/container tiers) — phantom affordance.
- **One-off radii** outside the card tiers (`rounded-[14px]`).
- **Latin habits on Hebrew** — `uppercase`, tracked overlines, negative letter-spacing, hard-coded `left/right`.
- **Raw hex / rgb / inline `style={{color}}`** in components — run `token-lint.sh`. (Sole exception: the data-driven `--party` variable from the party→token map.)
- **Dark-mode classes** (`dark:*`) — out of scope for v1; don't scatter them now.
