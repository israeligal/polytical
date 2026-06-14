# Pre-voting on upcoming bills — "עמדה מראש" (agenda stances)

> Design doc — converged from brainstorming on 2026-06-14. Status: **ready for /write-spec → /create-plan**.
> Builds directly on the bill-pages + lifetime-backfill work (PR #80) and the existing votes/stances/match stack.

## One-liner

Let users state a **stance (בעד/נגד)** on a bill *before* its decisive plenum vote. When the vote
happens, the early stance becomes a **normal `user_stances` row** and feeds "מי מצביע כמוכם"
exactly like a post-hoc stance. Pre-voting is just logging your עמדה **early** — no new score, no coins, no cards.

## Decisions (locked)

| Axis | Decision |
| --- | --- |
| **Mechanic** | Unscored **stance** (extends עמדות + the match engine). NOT a scored prediction/market. |
| **Resolution** | **Merges into matching.** On the decisive vote, the pre-vote stance is adopted into `user_stances` (userId, linkedVoteId, stance) and the existing match engine picks it up transparently. |
| **Eligibility** | **Auto-curated by status.** Bills approaching 2nd–3rd reading only — `statusId ∈ {113, 130, 114}` (~183 K25 bills today). Admin can promote/hide on top. |
| **Surface** | **Dedicated `על סדר היום` feed + nav entry**, sorted by imminence, PLUS a stance widget on each eligible `/bill/[id]`. |
| **Privacy** | Same as existing stances: private, k-anonymous aggregates only (k ≥ 10), direction never leaves the DB, cascade-deleted with the account. |

### Eligible statuses (the curation gate)

```
113  הכנה לקריאה שנייה ושלישית        ~149
130  הונחה על שולחן הכנסת לקריאה שנייה-שלישית   ~25
114  לדיון במליאה לקראת קריאה שנייה-שלישית      ~9
```

Rationale: these bills have **cleared first reading** → a decisive roll-call (קריאה שנייה ושלישית,
the `isDecisive` vote) is genuinely imminent, so the stance will actually resolve. Bills sitting at
"הונחה לדיון מוקדם" (4,778 of them) mostly die without any roll-call — a stance there could never merge.
Bills already at "התקבלה בקריאה שלישית" (533) are too late — the vote already happened.

## Why this is mostly a wiring job

Everything needed already exists:

- **`agenda_items`** (`schema-votes.ts:194`) — `billId` and `linkedVoteId` are already present and
  literally commented *"UNWIRED until P1 pre-voting (spec P1)"*. status enum = `announced/voted/dropped`,
  `addedBy` = `ingest/admin`. This table was built for exactly this feature.
- **`knesset_votes`** (`schema-votes.ts:37`) — carries `billId` and `isDecisive`. The bill→decisive-vote
  link is just `WHERE billId = ? AND isDecisive = true`.
- **`user_stances`** (`schema-votes.ts:166`) — PK `(userId, voteId)`, stance enum, the matching target.
- **`app/lib/match/`** — the "מי מצביע כמוכם" engine already consumes `user_stances`. No change needed
  once pre-vote rows are copied in.

## New surface: one table

The only genuinely new state is the pre-vote stance, which has no `voteId` yet (the vote hasn't happened).
Store it keyed to the agenda item; adopt it into `user_stances` at resolution.

```ts
// app/lib/schema-votes.ts
export const agendaStances = pgTable(
  "agenda_stances",
  {
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    agendaItemId: uuid("agendaItemId").notNull().references(() => agendaItems.id, { onDelete: "cascade" }),
    stance: userStance("stance").notNull(),        // reuse the existing for/against enum
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.agendaItemId] }),
    index("agenda_stances_item_idx").on(t.agendaItemId),   // community-aggregate scans
  ],
);
```

Mirrors `user_stances` exactly (free, removable by re-tapping, k-anonymous, cascade). Editable while the
item is `announced`; **locked once `voted`**.

## Data flow

### 1. Curate (ingest step, source=`ingest`)
On each bills ingest, upsert an `agenda_items` row (status `announced`, `billId` set, `linkedVoteId` null)
for every bill whose `statusId ∈ {113,130,114}`. Drop/avoid re-creating items whose bill left the window
to a dead status (halted/merged) → mark `dropped`. Admin rows (source=`admin`) are untouched by the sweep.

### 2. Stance (service + widget)
`setAgendaStance({ userId, agendaItemId, stance })` upserts into `agenda_stances`; re-tapping the selected
side deletes (mirrors `setStance`). Guard: only when the item is `announced`. Rate-limited like stances/comments.

### 3. Resolve (ingest step, the keystone)
For each `announced` item with a `billId`, look for `knesset_votes WHERE billId = item.billId AND isDecisive = true`.
When found, in one transaction:
- set `agenda_items.linkedVoteId = vote.voteId`, `status = 'voted'`;
- **adopt**: `INSERT INTO user_stances (userId, voteId=linkedVoteId, stance) SELECT … FROM agenda_stances WHERE agendaItemId = item.id ON CONFLICT (userId, voteId) DO NOTHING`.

From that moment the stance is a normal עמדה — the match engine and the community split on the vote include it,
with zero match-engine changes. Items whose bill reaches a terminal non-vote status → `dropped` (stances left inert).

### 4. Display
- **`/agenda`** — list `announced` items (join bill title/status), sorted by `expectedDate`/imminence; each row
  links to `/bill/[id]` and shows the live community split once k ≥ 10.
- **`/bill/[id]`** — if an `announced` agenda item exists for this bill, render the בעד/נגד widget + split.
  After resolution, the existing post-vote view (roll-call + "מי מצביע כמוכם") already covers the reveal.
- **Nav** — add `על סדר היום` entry.

## Open implementation questions (for the spec/plan)

1. **Identifying THE decisive vote per bill** — confirm exactly one `isDecisive` row per `billId` (or pick by latest `voteDate`).
2. **`expectedDate` source** — does the OData status payload give a scheduled plenum date, or do we sort by `lastUpdatedDate`/status only?
3. **Admin curation surface** — reuse the existing agenda-items admin (read at `votes/read-repo.ts`) for promote/hide, or add a flag column?
4. **Re-curation churn** — a bill can bounce between statuses; ensure the sweep is idempotent and doesn't resurrect a `dropped` item or orphan stances.
5. **Lock timing** — lock edits at `status != 'announced'` (i.e. the instant resolution runs), surfaced in the UI.

## Out of scope (v1)

- No scoring, leaderboard, coins, or card progress from pre-votes (per the locked mechanic).
- No "you vs Knesset" standalone reflection beyond what matching already shows (user chose "merges into matching", not "both").
- No notifications when a watched item is voted (candidate for a fast-follow).

## Testing (PGlite, real transactions)

- Curation sweep creates/updates/drops `agenda_items` correctly across status transitions (idempotent).
- `setAgendaStance` upsert/delete + `announced`-only guard.
- **Resolution transaction**: agenda_stances → user_stances adoption is atomic, idempotent (ON CONFLICT),
  and the adopted rows are then visible to the match engine. Lock after `voted`.
- k-anonymity: split hidden below k = 10.
```
