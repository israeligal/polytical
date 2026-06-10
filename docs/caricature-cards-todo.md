# Caricature cards — remaining work toward all-120

**Status: 85 of ~120 MKs carded and live on prod.** Generation uses the interactive Gemini-in-Chrome pipeline (see `.claude/skills/caricature-cards`), so the rest needs the Claude Chrome extension connected. Resume: reconnect https://claude.ai/chrome, then dispatch Sonnet subagents per the skill (sequential — shared clipboard).

## A. Photo-ready — generate immediately (refs already in `.caricature-capture/refs/ref-<id>.png`)
All common → slate frame.

| personId | name | English (banner) |
|---|---|---|
| 30780 | רון כץ | Ron Katz |
| 30782 | טטיאנה מזרסקי | Tatiana Mazarsky |
| 30809 | גלית דיסטל אטבריאן | Galit Distel-Atbaryan |
| 30812 | שמחה רוטמן | Simcha Rothman |
| 30820 | סימון דוידסון | Simon Davidson |
| 30702 | חוה אתי עטייה | Hava Eti Atia |
| 30837 | דבי ביטון | Debbie Biton |
| 30874 | צבי ידידיה סוכות | Tzvi Sukkot |

## B. Need a photo (no free image found server-side; browser-source or user-supplied)
Tried: he-Wikipedia pageimages, Wikidata Commons (exact + fuzzy + per-MK), Commons category + file search. The Knesset's official member photos on Commons carry a `(NOAM####)` suffix — mine that batch *via the browser* (server-side fetches are bot-blocked), or paste a photo per the Bibi flow.

| personId | name |
|---|---|
| 30842 | חנוך דב מלביצקי |
| 30682 | מיכאל מרדכי ביטון |
| 30706 | קטי קטרין שטרית |
| 30810 | מיכל מרים וולדיגר |
| 30831 | אלי דלל |
| 30832 | אליהו רביבו |
| 30835 | בועז ביסמוט |
| 30839 | דן אילוז |
| 30840 | ואליד אלהואשלה |
| 30843 | יאסר חוג'יראת |
| 30846 | יצחק גולדקנופ (actually a minister → sapphire tier; DB role is stale) |
| 30849 | לימור סון הר מלך |
| 30861 | שלום דנינו |
| 30863 | שרון ניר |
| 30868 | יונתן מישרקי |
| 30871 | שלי טל מירון |
| 30876 | אושר שקלים |
| 30879 | ששון ששי גואטה |
| 30894 | סמיר בן סעיד |
| 30895 | עדי עזוז |
| 30880 | אביחי אברהם בוארון |

## C. Excluded / wrong photo
- 23565 מרב מיכאלי — excluded per maintainer (no longer relevant).
- 30770 (Yosef Taieb), 30777 (Moshe Tur-Paz) — fuzzy match returned the wrong person's photo (Gemini refused); re-source before generating.

## Notes
- **DB is a 2022 (25th-Knesset) snapshot** — some names/roles are stale (e.g. Goldknopf is a minister, not rank-and-file). A fresh Knesset re-ingest would fix the underlying data and recompute rarity tiers. The weekly roster-check routine (`trig_018PkYLFapcB2ddXTcEV42Gs`) surfaces drift each Monday.
- Wiring after generation: `sips --resampleWidth 760 → public/caricatures/<id>.png`, set `imageUrl` by personId, commit, PR → main (Vercel auto-deploys).
