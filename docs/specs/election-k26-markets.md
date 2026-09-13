# Draft: K26 election prediction markets

Backs the promise on `/guides/elections-2026`. A prediction is a stake-less pick of one outcome per market (no coins). Every market resolves ONLY from an official source, by exact result, never a guess. Copy is Hebrew, times Asia/Jerusalem stored UTC.

Status: DRAFT for review. Do NOT create yet: the election date, final registered party slate, and PM candidates are not fixed. This doc is the content; creation is a later step (see bottom).

## Open decisions (confirm before creating)

1. **Election date** unknown (expected ~Oct/Nov 2026). Every `closeAt` below is `ELECTION_DAY 07:00 Asia/Jerusalem` (polls open) as a placeholder; set the real date once CEC publishes it.
2. **Party slate** for "leading party" and threshold markets must be re-taken from the final registered lists (~T-38 days) and from polling for the borderline set. The party labels below are current-Knesset placeholders.
3. **PM candidates** for the government-formation market must be confirmed at registration. Candidate outcomes are `personId`-linked (stable id, never name-matched).
4. **Government/coalition timing**: markets close at election day (predict before results). They resolve weeks later (tasking / swearing-in). Alternative: run a second-wave government market opened after results for those who want to predict post-result. Flag if you want both.

## Resolution sources (official only)

- Seats / leading party / threshold: Central Elections Committee certified results, `https://www.bechirot.gov.il` (exact results URL, e.g. `votesNN.bechirot.gov.il`, published on election night).
- Who is tasked to form the government: President of Israel official announcement, `https://www.president.gov.il`.
- Government formed / repeat elections: `https://www.knesset.gov.il` (confidence vote / dissolution).

Threshold = 3.25% of valid votes.

## Flagship markets

### A. איזו מפלגה תזכה במספר המושבים הגדול ביותר?
- type: `multi` · category: `elections`
- outcomes (labelHe, no personId; parties are not persons): `הליכוד`, `יש עתיד`, `המחנה הממלכתי`, `הציונות הדתית`, `ש"ס`, `יהדות התורה`, `ישראל ביתנו`, `אחר` (8 = cap; re-cut to the final slate).
- closeAt: ELECTION_DAY 07:00
- resolutionSourceUrl: CEC results · resolutionNote: המפלגה שקיבלה את מספר המנדטים הגדול ביותר בתוצאות הרשמיות המאושרות.

### B. מי יתבקש להרכיב את הממשלה?
- type: `multi` · category: `elections`
- outcomes (personId-linked candidates): `בנימין נתניהו` (965), `נפתלי בנט` (23511), `גדי איזנקוט` (30836), `אחר` (no personId). Candidate set reflects Sept 2026 standings; re-confirm at registration.
- closeAt: ELECTION_DAY 07:00
- resolutionSourceUrl: President · resolutionNote: חבר הכנסת שהנשיא הטיל עליו את מלאכת הרכבת הממשלה, לפי ההודעה הרשמית.

### C. איזו ממשלה תוקם אחרי הבחירות?
- type: `multi` · category: `coalition`
- outcomes: `קואליציית ימין וחרדים בראשות הליכוד`, `ממשלת מרכז-שמאל / שינוי`, `ממשלת אחדות רחבה`, `בחירות חוזרות ללא הרכבת ממשלה` (4 buckets).
- closeAt: ELECTION_DAY 07:00
- resolutionSourceUrl: Knesset · resolutionNote: לפי הרכב הממשלה שקיבלה את אמון הכנסת. אם פורקה הכנסת לפני הרכבת ממשלה, מוכרעת התוצאה "בחירות חוזרות". יש להגדיר במפורש אילו סיעות נכללות בכל דלי לפני הפרסום.

### D. Threshold markets (binary, one per borderline party)
- type: `binary` (כן / לא) · category: `elections`
- questionHe pattern: `האם [שם המפלגה] תעבור את אחוז החסימה?`
- Draft set (replace with the actual borderline parties from late polling): `העבודה`, `הדמוקרטים`, `בל"ד`. One market each.
- closeAt: ELECTION_DAY 07:00
- resolutionSourceUrl: CEC results · resolutionNote: המפלגה קיבלה 3.25% ומעלה מהקולות הכשרים בתוצאות הרשמיות.

## Optional / second wave

- **אחוז הצבעה**: binary over/under a round number (e.g. `האם אחוז ההצבעה יעבור 70%?`), resolves from CEC turnout. Not promised on the guide page; include only if you want a turnout angle.
- **בחירות חוזרות**: `האם יוכרזו בחירות חוזרות תוך 6 חודשים מהבחירות?` (binary), resolves from Knesset dissolution. Overlaps bucket C4; pick one, not both.
- **Post-result government market**: same as B but opened after results with closeAt at the tasking window, for post-result prediction.

## How and when to create

- Global markets (`groupId = null`), created via admin (`app/actions/admin-markets.ts`) or a guarded seed (`assertNonProductionDb()` first for any script; production markets go through admin). `scripts/seed-markets.ts` is dev-only and already has `category: "elections"` / `"coalition"` examples to mirror.
- Multi markets need 3-8 outcomes; a 2-outcome question is a `binary` (כן/לא), not a multi.
- Link candidate/politician outcomes by `outcomes.personId` (stable id) so a correct pick advances that MK's card progress on resolve.
- Timing: open the set a few weeks before election day once the date and slate are fixed; `closeAt` at polls-open so every prediction locks before voting. Government/coalition markets resolve later, from the official sources above.
