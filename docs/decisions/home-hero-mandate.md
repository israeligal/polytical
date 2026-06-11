# Key Decisions: Polymarket-style hero + נחשו→מנדט rebrand

### Hero is content-first: spotlight + "חם עכשיו" rail, no marketing copy (2026-06-11, #44)
Replaced the slogan hero (big two-line headline, paragraph, two CTA buttons) with the markets themselves, Polymarket-style: a featured-market spotlight panel (read-only outcome rows — portraits, tinted crowd-share fills, big percentages; the whole panel links to the market) beside a ranked top-5 most-active rail. Three layouts were built as Storybook stories (`Sections/Hero`) and Gal picked A (spotlight+rail) over B (full-width spotlight) and C (three-up cards). The markets-section heading collapsed from kicker+"על מה מנחשים עכשיו" to a single big **תחזיות**.

### The hot rail only ranks markets with predictions; empty rail unmounts (2026-06-11, #44)
A "hot now" list of 0-predictor rows reads as broken (arbitrary order, "0 מנחשים", leader "0%"), so rail items require `total > 0` — which also guarantees a leading outcome exists (no unguarded `[0]` on outcome-less markets, which would 500 the homepage RSC). With no qualifying items the rail renders `null` and the spotlight expands to all 3 grid columns.

### Spotlight rows duplicate OutcomeRows' visuals on purpose (2026-06-11, #44)
`HeroSpotlight` re-implements the row chart rather than reusing `OutcomeRows`: that component is a `'use client'` picker with buttons, and the spotlight rows sit inside one big `<Link>` (nested interactive elements are invalid). Known cost: visual tweaks to the row chart must land in both. Extract a shared presentational row only when a third consumer appears.

### "מנדט" replaces the נחשו/ניחוש (guess) verb family (2026-06-11, #47)
Gal picked **תנו מנדט** ("cast your mandate") over נביאים/לנבא (prophets), פתק בקלפי (ballot slip), and לחזות (forecast verb). Mapping: ניחוש→מנדט, ניחושים נכונים→מנדטים מדויקים, הניחוש שלך→המנדט שלך, לנחש→לתת מנדט, המנחשים הגדולים→מובילי המנדטים, צדקת בניחוש→המנדט נפדה — צדקת; legal pages use משחק תחזיות. Constraint that killed the "vote" option: **הצבעות is the Knesset roll-call feature's nav label** — a vote verb would collide with real votes. Like the תחזיות rename, this is Hebrew-strings-only: code stays `bet`/`prediction`/`predictors`. The root נחש appears inside unrelated words (נחשב), so the sweep was ordered exact-string replacement, never bare-root.

### main was undeployable: favicon.ico must embed RGBA PNGs (2026-06-11, #48)
Vercel prod deploys failed since `d6e6f10` (48px favicon frame, PR #43) with Turbopack's `Format error decoding Ico: The PNG is not in RGBA format` — the ICO embedded RGB-mode PNGs. Re-encoded the same frames as RGBA (PIL: `convert('RGBA')` per size, re-save). Any future favicon regeneration must keep RGBA; local `pnpm build` catches it.
