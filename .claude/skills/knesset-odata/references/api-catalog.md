# Knesset OData API Catalog

> Full entity catalog for the Knesset OData services. Companion to
> `.claude/skills/knesset-odata/SKILL.md`.
>
> **Verification legend (read before trusting any field):**
> - **VERIFIED** — live-queried on **2026-06-11** (`$top=1&$format=json`, Accept: application/json);
>   the field list and types are confirmed against the actual JSON response, with a real sample value cited.
> - **DOCUMENTED-ONLY** — the entity + its fields appear in the service `$metadata` (fetched
>   2026-06-11) but were **not** live-probed. Field names/types are from `$metadata`; no row was
>   inspected, so nullability/serialization quirks are unconfirmed. Nothing here is invented — every
>   field in a DOCUMENTED-ONLY table is copied verbatim from `$metadata`.
>
> **Service facts (verified 2026-06-11):**
> - Base URL: `https://knesset.gov.il/Odata/ParliamentInfo.svc/`
> - `$metadata` declares `m:MaxDataServiceVersion="3.0"`, but the live JSON responses are **v3-shaped**
>   (rows under `value`, `odata.metadata`, `odata.count`, **relative** `odata.nextLink` on paging).
>   The app's `fetchAll` reads both the v3 (`d.results`/`d.__next`) and the observed
>   (`value`/`odata.nextLink`) shapes. See [OData Mechanics & Gotchas](#odata-mechanics--gotchas).
> - Auth: none — public, read-only.
> - **38 EntityTypes** total (all 38 enumerated below; ~16 detailed with field tables, the rest in the
>   [appendix index](#appendix--remaining-entitytypes-documented-only)).
> - Second service: `https://knesset.gov.il/Odata/Votes.svc/` — **frozen at K24** (latest vote 2021-07-13,
>   0 K25 rows). See [Votes.svc](#votessvc--frozen-at-k24). For live K25 votes use the WebSiteApi
>   (see [cross-reference](#cross-reference-knesset-votes-skill-websiteapi)).
> - **Current Knesset = 25** (verified: `KNS_Bill/$count?$filter=KnessetNum eq 26` → `0`;
>   `eq 25` → `7434`). Bump `CURRENT_KNESSET` in `app/lib/knesset/odata.ts` when K26 is seated.

---

## Table of Contents

- [Detailed entities (the ~16 most useful)](#detailed-entities)
  - People & Roles: [KNS_Person](#kns_person) · [KNS_PersonToPosition](#kns_persontoposition) · [KNS_Position](#kns_position) · [KNS_Faction](#kns_faction) · [KNS_MkSiteCode](#kns_mksitecode)
  - Bills: [KNS_Bill](#kns_bill) · [KNS_BillInitiator](#kns_billinitiator)
  - Queries: [KNS_Query](#kns_query)
  - Committees: [KNS_Committee](#kns_committee) · [KNS_CommitteeSession](#kns_committeesession) · [KNS_CmtSessionItem](#kns_cmtsessionitem)
  - Plenum: [KNS_PlenumSession](#kns_plenumsession) · [KNS_PlmSessionItem](#kns_plmsessionitem)
  - Government & Agenda: [KNS_GovMinistry](#kns_govministry) · [KNS_Agenda](#kns_agenda)
  - Lookups: [KNS_Status](#kns_status) · [KNS_ItemType](#kns_itemtype) · [KNS_KnessetDates](#kns_knessetdates)
- [Appendix — remaining EntityTypes (DOCUMENTED-ONLY)](#appendix--remaining-entitytypes-documented-only)
- [Votes.svc — frozen at K24](#votessvc--frozen-at-k24)
- [Cross-reference: knesset-votes skill (WebSiteApi)](#cross-reference-knesset-votes-skill-websiteapi)
- [OData Mechanics & Gotchas](#odata-mechanics--gotchas)
- [Official sources & documentation](#official-sources--documentation)

---

## Detailed entities

> Field types below are the **declared `$metadata` EDM type**. Where the live JSON serialized a value
> differently from the declared type (a real quirk), the "Notes" column flags it. PersonID **30300 =
> Amir Ohana (אמיר אוחנה)** is the standing test subject for VERIFIED probes.

### KNS_Person

**Status: VERIFIED** — `KNS_Person?$filter=PersonID eq 30300` returned the row below.

Purpose: one row per person who has ever been an MK or held a parliamentary role — the stable identity anchor for the whole service.

Key: `PersonID`.

| Field | EDM type | Notes |
|---|---|---|
| `PersonID` | Int32 | **Primary key** — stable numeric id; join on this, never on Hebrew name |
| `LastName` | String\|null | Hebrew surname (sample: `אוחנה`) |
| `FirstName` | String\|null | Hebrew given name (sample: `אמיר`) |
| `GenderID` | Int32\|null | Numeric gender code (sample: `251` = male) |
| `GenderDesc` | String\|null | Hebrew gender label (sample: `זכר`) |
| `Email` | String\|null | Parliamentary email (sample: `amiro@knesset.gov.il`) |
| `IsCurrent` | Boolean\|null | `true` = currently serving (sample: `true`) |
| `LastUpdatedDate` | DateTime\|null | Plain ISO string, e.g. `2022-11-10T11:19:09.353` (no timezone, **not** `/Date(ms)/`) |

Navigation properties (from `$metadata`): `KNS_BillInitiators`, `KNS_BillHistoryInitiators`, `KNS_PersonToPositions`, `KNS_Agendas`, `KNS_AgendaMinistries`, `KNS_Queries`.

Example — fetch one MK:
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_Person?$filter=PersonID%20eq%2030300&$format=json
```

**Gotcha:** `KNS_Person` carries `IsCurrent` but **no position/faction**. To get *sitting MKs* you must filter `KNS_PersonToPosition`, not `KNS_Person` — `KNS_Person/$count?$filter=IsCurrent eq true` returned `139` (verified), which is more than the seated-MK count because it includes other current role-holders. Name collisions are real: `substringof('אוחנה',LastName)` returns **both** PersonID 585 and 30300 (verified) — always commit by `PersonID`.

---

### KNS_PersonToPosition

**Status: VERIFIED** — `KNS_PersonToPosition?$filter=PersonID eq 30300&$top=3` returned real role history (MK in K20/K21, then Minister of Justice PositionID 39 in gov 34).

Purpose: junction table of every role a person has held (MK / Minister / Committee Chair / faction membership), with dates, faction, ministry, and committee. Authoritative source for current-MK role + faction.

Key: `PersonToPositionID`.

| Field | EDM type | Notes |
|---|---|---|
| `PersonToPositionID` | Int32 | **Primary key** (sample: `18085`) |
| `PersonID` | Int32\|null | FK → KNS_Person |
| `PositionID` | Int32\|null | FK → KNS_Position. `43`=MK(m), `61`=MK(f), `54`=faction membership, `39`=Minister of Justice (sample), etc. |
| `KnessetNum` | Int32\|null | Knesset of this tenure (sample: `20`) |
| `StartDate` | DateTime\|null | ISO (sample: `2015-12-27T00:00:00`) |
| `FinishDate` | DateTime\|null | ISO; `null` while active |
| `GovMinistryID` | Int32\|null | FK → KNS_GovMinistry; set for ministerial rows (sample: `873`) |
| `GovMinistryName` | String\|null | Denormalized ministry name (sample: `משרד המשפטים`) |
| `DutyDesc` | String\|null | Hebrew duty text (sample: `שר המשפטים`) |
| `FactionID` | Int32\|null | **`null` on PositionID 43/61** (verified); populated on PositionID 54 |
| `FactionName` | String\|null | Denormalized faction name |
| `GovernmentNum` | Int32\|null | Government number for ministerial rows (sample: `34`) |
| `CommitteeID` | Int32\|null | FK → KNS_Committee for committee roles |
| `CommitteeName` | String\|null | Denormalized committee name |
| `IsCurrent` | Boolean\|null | `true` = role active now |
| `LastUpdatedDate` | DateTime\|null | ISO |

Navigation properties: `KNS_Person`, `KNS_Committee`, `KNS_GovMinistry`, `KNS_Position`.

Example — current faction membership for all active MKs (the FactionID-bearing path):
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_PersonToPosition?$filter=IsCurrent%20eq%20true%20and%20PositionID%20eq%2054&$format=json
```

**Critical:** to get a current MK's `FactionID`, read the **PositionID 54** row — the MK rows (43/61) have `FactionID = null` (verified on PersonID 30300). The app's helper `CURRENT_MK_FILTER` (`IsCurrent eq true and (PositionID eq 43 or PositionID eq 61)`) finds the *roster*; faction comes from the 54 row.

---

### KNS_Position

**Status: VERIFIED** — `KNS_Position?$filter=PositionID eq 43` → `Description: חבר הכנסת`.

Purpose: reference table of all parliamentary position types (gendered Hebrew labels).

Key: `PositionID`.

| Field | EDM type | Notes |
|---|---|---|
| `PositionID` | Int32 | **Primary key** |
| `Description` | String\|null | Hebrew, gendered (sample `43` → `חבר הכנסת`) |
| `GenderID` | Int32\|null | Numeric gender code (sample: `251`) |
| `GenderDesc` | String\|null | Hebrew gender label (sample: `זכר`) |
| `LastUpdatedDate` | DateTime\|null | ISO |

Known PositionIDs: `43`=חבר כנסת (MK male) · `61`=חברת כנסת (MK female) · `54`=faction membership (carries FactionID) · `39`=שר המשפטים (Minister of Justice).

Example (small table — safe to fetch all):
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_Position?$format=json
```

---

### KNS_Faction

**Status: VERIFIED** — `KNS_Faction?$filter=KnessetNum eq 25&$top=2` → FactionID 1095/1096 (`הליכוד`, etc.); total `odata.count` `"545"`.

Purpose: one row per faction **per Knesset** — a party recurs once per term it ran in. A K25 faction has its FactionID assigned for K25 (e.g. הליכוד = 1096 in K25).

Key: `FactionID`.

| Field | EDM type | Notes |
|---|---|---|
| `FactionID` | Int32 | **Primary key** (sample K25: `1096` = הליכוד) |
| `Name` | String\|null | Party/faction Hebrew name — **field is `Name`, NOT `FactionName`** |
| `KnessetNum` | Int32\|null | Knesset this faction belongs to (sample: `25`) |
| `StartDate` | DateTime\|null | Sample: `2022-11-15T00:00:00` |
| `FinishDate` | DateTime\|null | `null` if ongoing |
| `IsCurrent` | Boolean\|null | `true` for active K25 factions |
| `LastUpdatedDate` | DateTime\|null | ISO |

Example — all K25 factions:
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_Faction?$filter=KnessetNum%20eq%2025&$format=json
```

**Gotchas:** the party name lives in `Name`, not `FactionName` (that field doesn't exist on this entity — `FactionName` is only the denormalized column on `KNS_PersonToPosition`). Sentinel `FactionID 911` is a known garbage row — the ingest drops it. Sample names can carry a trailing space (`"הליכוד "`) — trim on ingest.

---

### KNS_MkSiteCode

**Status: VERIFIED** — `KNS_MkSiteCode?$filter=KnsID eq 30300` → `{"MKSiteCode":"943","KnsID":30300,"SiteId":953}`.

Purpose: maps `PersonID` (as `KnsID`) to the legacy Knesset-website MK ids. Use to build links to an MK's official Knesset page.

Key: `MKSiteCode`.

| Field | EDM type | Notes |
|---|---|---|
| `MKSiteCode` | Int64 | **Primary key** — **declared Int64 but serialized as a JSON string** (`"943"`) (quirk, verified) |
| `KnsID` | Int32\|null | FK → KNS_Person (`PersonID`) (sample: `30300`) |
| `SiteId` | Int32\|null | Legacy website MK id (sample: `953`) — **distinct id space** from `PersonID` |

Example:
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_MkSiteCode?$filter=KnsID%20eq%2030300&$format=json
```

**Warning — three distinct MK id spaces:** `PersonID` (OData) ≠ `SiteId` (this table) ≠ the WebSiteApi votes-dropdown id (`mkSiteId`, intentionally NULL in the votes pipeline — see knesset-votes skill). Never join across them.

---

### KNS_Bill

**Status: VERIFIED** — `KNS_Bill?$top=1` → BillID 5 (K1 חוק שכר חברי הכנסת); K25 count `7434` (verified).

Purpose: every bill ever introduced, K1 → current. ~7,434 K25 bills as of 2026-06-11.

Key: `BillID`.

| Field | EDM type | Notes |
|---|---|---|
| `BillID` | Int32 | **Primary key**; also the votes pipeline's `FK_ItemID` for bill votes |
| `KnessetNum` | Int32\|null | Knesset when introduced (sample: `1`) |
| `Name` | String\|null | Hebrew bill title |
| `SubTypeID` | Int32\|null | Numeric subtype (sample: `55`) |
| `SubTypeDesc` | String\|null | Hebrew subtype (sample: `ועדה`) |
| `PrivateNumber` | **Int32**\|null | Private-member bill number — **Int32, not string** (sample: `null`) |
| `CommitteeID` | Int32\|null | FK → KNS_Committee (referring committee) |
| `StatusID` | Int32\|null | FK → KNS_Status |
| `Number` | **Int32**\|null | Official bill number — **Int32, not string** (sample: `null`) |
| `PostponementReasonID` | Int32\|null | |
| `PostponementReasonDesc` | String\|null | |
| `PublicationDate` | DateTime\|null | Sample: `1949-06-07T00:00:00` |
| `MagazineNumber` | Int32\|null | Gazette issue (sample: `10`) |
| `PageNumber` | Int32\|null | Sample: `41` |
| `IsContinuationBill` | Boolean\|null | |
| `SummaryLaw` | String\|null | Short summary text |
| `PublicationSeriesID` | Int32\|null | Sample: `6071` |
| `PublicationSeriesDesc` | String\|null | Sample: `ספר החוקים` |
| `PublicationSeriesFirstCall` | String\|null | |
| `LastUpdatedDate` | DateTime\|null | ISO |

Navigation properties: `KNS_BillInitiators`, `KNS_BillNames`, `KNS_BillSplits`, `KNS_BillMainSplits`, `KNS_BillUnions`, `KNS_BillMainUnions`, `KNS_BillHistoryInitiators`, `KNS_DocumentBills`, `KNS_Committee`, `KNS_Status`.

Example — K25 bills, newest first:
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_Bill?$filter=KnessetNum%20eq%2025&$orderby=LastUpdatedDate%20desc&$format=json
```

---

### KNS_BillInitiator

**Status: VERIFIED** — `KNS_BillInitiator?$filter=PersonID eq 30300&$top=2` → BillInitiatorID 130273 etc.; with `$inlinecount=allpages` → `odata.count "213"`.

Purpose: links a person to a bill they initiated. A bill can have many initiators; `IsInitiator=true` marks a lead. Primary entity for counting per-MK bill activity.

Key: `BillInitiatorID`.

| Field | EDM type | Notes |
|---|---|---|
| `BillInitiatorID` | Int32 | **Primary key** (sample: `130273`) |
| `BillID` | Int32\|null | FK → KNS_Bill |
| `PersonID` | Int32\|null | FK → KNS_Person |
| `IsInitiator` | Boolean\|null | `true` = lead initiator (sample: `true`) |
| `Ordinal` | Int32\|null | Order among co-initiators (sample: `11`) |
| `LastUpdatedDate` | DateTime\|null | ISO |

Navigation properties: `KNS_Bill`, `KNS_Person`.

Example — count a person's K25 bills without downloading rows (scope via the bill's nav prop):
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_BillInitiator?$filter=PersonID%20eq%2030300%20and%20KNS_Bill%2FKnessetNum%20eq%2025&$inlinecount=allpages&$top=1&$format=json
```

**Critical gotcha:** `KNS_BillInitiator` has **no `KnessetNum` field of its own**. To scope by Knesset, filter through the navigation property: `KNS_Bill/KnessetNum eq 25` (encoded `KNS_Bill%2FKnessetNum%20eq%2025`).

---

### KNS_Query

**Status: VERIFIED** — `KNS_Query?$filter=PersonID eq 30300&$top=1` → QueryID 576022 (K20, TypeDesc `רגילה`).

Purpose: parliamentary queries (שאילתות — questions to ministers). One row per query.

Key: `QueryID`.

| Field | EDM type | Notes |
|---|---|---|
| `QueryID` | Int32 | **Primary key** (sample: `576022`) |
| `Number` | Int32\|null | Sequential number within a Knesset (sample: `390`) |
| `KnessetNum` | Int32\|null | **Direct field** — filter on it directly (unlike KNS_BillInitiator) |
| `Name` | String\|null | Hebrew query title |
| `TypeID` | Int32\|null | Query type code (sample: `48`) |
| `TypeDesc` | String\|null | Hebrew type (sample: `רגילה`; also `דחופה` = urgent) |
| `StatusID` | Int32\|null | FK → KNS_Status |
| `PersonID` | Int32\|null | FK → KNS_Person (the MK who filed) |
| `GovMinistryID` | Int32\|null | FK → KNS_GovMinistry (ministry queried) (sample: `964`) |
| `SubmitDate` | DateTime\|null | Sample: `2016-02-17T00:00:00` |
| `ReplyMinisterDate` | DateTime\|null | Date minister replied |
| `ReplyDatePlanned` | DateTime\|null | |
| `LastUpdatedDate` | DateTime\|null | ISO |

Navigation properties: `KNS_Person`, `KNS_GovMinistry`, `KNS_Status`, `KNS_DocumentQueries`.

Example — count a person's K25 queries (direct KnessetNum, no nav-prop trick):
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_Query?$filter=PersonID%20eq%2030300%20and%20KnessetNum%20eq%2025&$inlinecount=allpages&$top=1&$format=json
```

---

### KNS_Committee

**Status: VERIFIED** — `KNS_Committee?$filter=KnessetNum eq 25&$top=1` → CommitteeID 4185 (הוועדה המסדרת).

Purpose: every Knesset committee across all Knessets (standing, special, sub-committees).

Key: `CommitteeID`.

| Field | EDM type | Notes |
|---|---|---|
| `CommitteeID` | Int32 | **Primary key** (sample: `4185`) |
| `Name` | String\|null | Hebrew committee name (sample: `הוועדה המסדרת`) |
| `CategoryID` | Int16\|null | Category code (sample: `689`) |
| `CategoryDesc` | String\|null | Hebrew category |
| `KnessetNum` | Int32\|null | Knesset this committee belongs to (sample: `25`) |
| `CommitteeTypeID` | Int32\|null | Type code (sample: `72`) |
| `CommitteeTypeDesc` | String\|null | Hebrew type (sample: `ועדה מיוחדת`) |
| `Email` | String\|null | Committee email |
| `StartDate` | DateTime\|null | Sample: `2022-11-15T00:00:00` |
| `FinishDate` | DateTime\|null | `null` = still active |
| `AdditionalTypeID` | Int32\|null | Sample: `992` |
| `AdditionalTypeDesc` | String\|null | Hebrew (sample: `מיוחדת`; also `קבועה` = standing) |
| `ParentCommitteeID` | Int32\|null | FK → KNS_Committee (sub-committees) |
| `CommitteeParentName` | String\|null | Denormalized parent name |
| `IsCurrent` | Boolean\|null | |
| `LastUpdatedDate` | DateTime\|null | ISO |

Navigation properties: `KNS_PersonToPositions`, `KNS_Committees`, `KNS_JointCommitteesJoint`, `KNS_JointCommittees`, `KNS_CommitteeSessions`, `KNS_Agendas`, `KNS_AgendasRecommended`, `KNS_Bills`, `KNS_CommitteeParent`.

Example — K25 current committees:
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_Committee?$filter=KnessetNum%20eq%2025%20and%20IsCurrent%20eq%20true&$format=json
```

---

### KNS_CommitteeSession

**Status: VERIFIED** — `KNS_CommitteeSession?$top=1` → CommitteeSessionID 64515 (K16, `מבוטלת`), carries a `SessionUrl`.

Purpose: individual committee meeting sessions, with location, status, and links to the session page / broadcast.

Key: `CommitteeSessionID`.

| Field | EDM type | Notes |
|---|---|---|
| `CommitteeSessionID` | Int32 | **Primary key** (sample: `64515`) |
| `Number` | Int32\|null | Session number within the committee |
| `KnessetNum` | Int32\|null | Sample: `16` |
| `TypeID` | Int32\|null | Sample: `161` |
| `TypeDesc` | String\|null | Hebrew session type (sample: `פתוחה` = open) |
| `CommitteeID` | Int32\|null | FK → KNS_Committee (sample: `22`) |
| `StatusID` | Int32\|null | FK → KNS_Status |
| `StatusDesc` | String\|null | Hebrew status (sample: `מבוטלת` = cancelled) |
| `Location` | String\|null | Room/building text |
| `SessionUrl` | String\|null | URL to the official session page (sample → `main.knesset.gov.il/.../AllCommitteesAgenda.aspx?...ItemID=64515`) |
| `BroadcastUrl` | String\|null | URL to live/archived broadcast |
| `StartDate` | DateTime\|null | Sample: `2003-02-25T10:30:00` |
| `FinishDate` | DateTime\|null | |
| `Note` | String\|null | |
| `LastUpdatedDate` | DateTime\|null | ISO |

Navigation properties: `KNS_CmtSessionItems`, `KNS_DocumentCommitteeSessions`, `KNS_Committee`, `KNS_Status`.

Example — recent sessions for a committee:
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_CommitteeSession?$filter=CommitteeID%20eq%201&$orderby=StartDate%20desc&$top=10&$format=json
```

---

### KNS_CmtSessionItem

**Status: DOCUMENTED-ONLY** — fields from `$metadata`; not row-probed.

Purpose: agenda items within a committee session — each row links a session to a bill/query/other item.

Key: `CmtSessionItemID`.

| Field | EDM type | Notes |
|---|---|---|
| `CmtSessionItemID` | Int32 | **Primary key** |
| `ItemID` | Int32\|null | Id of the linked item (BillID / QueryID / …) — resolve the table via `ItemTypeID` → KNS_ItemType |
| `CommitteeSessionID` | Int32\|null | FK → KNS_CommitteeSession |
| `Ordinal` | Int32\|null | Order within session |
| `StatusID` | Int32\|null | FK → KNS_Status |
| `Name` | String\|null | Hebrew item name |
| `ItemTypeID` | Int32\|null | FK → KNS_ItemType |
| `LastUpdatedDate` | DateTime\|null | ISO |

Navigation properties: `KNS_ItemType`, `KNS_CommitteeSession`, `KNS_Status`.

Example:
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_CmtSessionItem?$filter=CommitteeSessionID%20eq%2064515&$format=json
```

---

### KNS_PlenumSession

**Status: VERIFIED** — `KNS_PlenumSession?$filter=KnessetNum eq 25&$top=1` → PlenumSessionID 2195640 (first K25 plenary, 2022-11-15 16:00).

Purpose: full Knesset plenum sittings (all MKs assembled), with start/end times.

Key: `PlenumSessionID`.

| Field | EDM type | Notes |
|---|---|---|
| `PlenumSessionID` | Int32 | **Primary key** (sample: `2195640`) |
| `Number` | Int32\|null | Session number within the Knesset (sample: `1`) |
| `KnessetNum` | Int32\|null | Sample: `25` |
| `Name` | String\|null | Hebrew name, usually with date/time (sample: `ישיבת מליאה בתאריך 15/11/2022 בשעה 16:00`) |
| `StartDate` | DateTime\|null | Sample: `2022-11-15T16:00:00` |
| `FinishDate` | DateTime\|null | Sample: `2022-11-15T16:50:00` |
| `IsSpecialMeeting` | Boolean\|null | `true` for special/emergency sittings (sample: `false`) |
| `LastUpdatedDate` | DateTime\|null | ISO |

Navigation properties: `KNS_PlmSessionItems`, `KNS_DocumentPlenumSessions`.

Example — K25 plenum sittings, newest first:
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_PlenumSession?$filter=KnessetNum%20eq%2025&$orderby=StartDate%20desc&$format=json
```

---

### KNS_PlmSessionItem

**Status: VERIFIED** — `KNS_PlmSessionItem?$top=1` → plmPlenumSessionID 3364, `Ordinal` came back as the **string** `"1"`.

Purpose: agenda items within a plenum sitting — each row links a sitting to a bill / discussion / other item.

Key: `plmPlenumSessionID` (lowercase `plm` prefix — not a typo).

| Field | EDM type | Notes |
|---|---|---|
| `plmPlenumSessionID` | Int32 | **Primary key** (sample: `3364`) — note the lowercase `plm` |
| `ItemID` | Int32\|null | Id of the linked item (sample: `9629`) |
| `PlenumSessionID` | Int32\|null | FK → KNS_PlenumSession (sample: `9626`) |
| `ItemTypeID` | Int32\|null | FK → KNS_ItemType (sample: `9`) |
| `ItemTypeDesc` | String\|null | Hebrew item type (sample: `פריטי מליאה`) |
| `Ordinal` | Int64\|null | **Declared Int64 but serialized as a JSON string** (`"1"`) (quirk, verified) |
| `Name` | String\|null | Hebrew item name |
| `StatusID` | Int32\|null | FK → KNS_Status (sample: `null`) |
| `IsDiscussion` | Int32\|null | `1` = discussion item (sample: `1`) |
| `LastUpdatedDate` | DateTime\|null | ISO |

Navigation properties: `KNS_ItemType`, `KNS_PlenumSession`, `KNS_Status`.

Example — items for one plenum sitting:
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_PlmSessionItem?$filter=PlenumSessionID%20eq%202195640&$format=json
```

---

### KNS_GovMinistry

**Status: VERIFIED** — `KNS_GovMinistry?$top=1` → GovMinistryID 490 (`אין נתונים`, `IsActive:false`).

Purpose: reference table of government ministries (past + present). FK target from bills, queries, positions.

Key: `GovMinistryID`.

| Field | EDM type | Notes |
|---|---|---|
| `GovMinistryID` | Int32 | **Primary key** (sample: `490`) |
| `Name` | String\|null | Hebrew ministry name (sample: `אין נתונים`) |
| `IsActive` | Boolean\|null | `true` = currently active ministry (sample: `false`) |
| `LastUpdatedDate` | DateTime\|null | ISO |

Navigation properties: `KNS_IsraelLawMinstries`, `KNS_Queries`, `KNS_PersonToPositions`.

Example — active ministries:
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_GovMinistry?$filter=IsActive%20eq%20true&$format=json
```

---

### KNS_Agenda

**Status: VERIFIED** — `KNS_Agenda?$filter=InitiatorPersonID eq 30300&$top=1` → AgendaID 575511 (K20, `עצמאית`).

Purpose: "סדר יום" / motion-for-the-agenda items — a procedure for raising a topic for plenary discussion (distinct from a bill).

Key: `AgendaID`.

| Field | EDM type | Notes |
|---|---|---|
| `AgendaID` | Int32 | **Primary key** (sample: `575511`) |
| `Number` | Int32\|null | Sequential agenda number (sample: `2737`) |
| `ClassificationID` | Int32\|null | Sample: `165` |
| `ClassificationDesc` | String\|null | Hebrew (sample: `עצמאית`) |
| `LeadingAgendaID` | Int32\|null | FK → KNS_Agenda (if derivative) |
| `KnessetNum` | Int32\|null | Sample: `20` |
| `Name` | String\|null | Hebrew topic name |
| `SubTypeID` | Int32\|null | Sample: `57` |
| `SubTypeDesc` | String\|null | Hebrew subtype (sample: `רגילה`; also `דחופה`) |
| `StatusID` | Int32\|null | FK → KNS_Status (sample: `304`) |
| `InitiatorPersonID` | Int32\|null | FK → KNS_Person (the MK who raised it) (sample: `30300`) |
| `GovRecommendationID` | Int32\|null | |
| `GovRecommendationDesc` | String\|null | |
| `PresidentDecisionDate` | DateTime\|null | |
| `PostopenmentReasonID` | Int32\|null | **Note the spelling** (`Postopenment`) — metadata typo, use as-is |
| `PostopenmentReasonDesc` | String\|null | Same typo |
| `CommitteeID` | Int32\|null | FK → KNS_Committee (sample: `935`) |
| `RecommendCommitteeID` | Int32\|null | |
| `MinisterPersonID` | Int32\|null | FK → KNS_Person (responding minister) |
| `LastUpdatedDate` | DateTime\|null | ISO |

Navigation properties: `KNS_Person`, `KNS_AgendaLeading`, `KNS_Agendas`, `KNS_PersonMinister`, `KNS_Committee`, `KNS_CommitteeRecommended`, `KNS_DocumentAgendas`, `KNS_Status`.

Example — K25 agenda motions by one MK:
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_Agenda?$filter=KnessetNum%20eq%2025%20and%20InitiatorPersonID%20eq%2030300&$format=json
```

---

### KNS_Status

**Status: VERIFIED** — `KNS_Status?$top=1` → StatusID 6 (`בטיפול המשרד הנשאל`, TypeDesc `שאילתה`).

Purpose: status codes shared across bills, queries, agendas, and committee sessions. Each status belongs to a `TypeID` namespace (so the same numeric status can mean different things across entity families — always read `TypeDesc`).

Key: `StatusID`.

| Field | EDM type | Notes |
|---|---|---|
| `StatusID` | Int32 | **Primary key** (sample: `6`) |
| `Desc` | String\|null | Hebrew status text (sample: `בטיפול המשרד הנשאל`) |
| `TypeID` | Int32\|null | Entity family this status belongs to (sample: `1`) |
| `TypeDesc` | String\|null | Hebrew family label (sample: `שאילתה`) |
| `OrderTransition` | Int32\|null | **Int32, not string** (sample: `null`) |
| `IsActive` | Boolean\|null | Sample: `null` |
| `LastUpdatedDate` | DateTime\|null | ISO |

Example — all statuses (small table; build a lookup map):
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_Status?$format=json
```

---

### KNS_ItemType

**Status: VERIFIED** — `KNS_ItemType?$top=3` → `1`→שאילתה/`KNS_Query`, `2`→הצעת חוק/`KNS_Bill`, `3`→הצעת אי אמון/`null`.

Purpose: maps an item-type id to its source entity table. Used by `KNS_CmtSessionItem` and `KNS_PlmSessionItem` to know which table their `ItemID` points at.

Key: `ItemTypeID`.

| Field | EDM type | Notes |
|---|---|---|
| `ItemTypeID` | Int32 | **Primary key** (sample: `2`) |
| `Desc` | String\|null | Hebrew type name (sample: `הצעת חוק`) |
| `TableName` | String\|null | OData entity name (sample: `KNS_Bill`); `null` when no backing table (e.g. id `3` = הצעת אי אמון) |

Example:
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_ItemType?$format=json
```

---

### KNS_KnessetDates

**Status: VERIFIED** — `KNS_KnessetDates?$filter=IsCurrent eq true&$top=2` → KnessetDateID 161/162 (K25 assemblies, `IsCurrent:true`).

Purpose: official assembly/plenum date ranges per Knesset. Use to map a date to the Knesset that was sitting.

Key: `KnessetDateID`.

| Field | EDM type | Notes |
|---|---|---|
| `KnessetDateID` | Int32 | **Primary key** (sample: `161`) |
| `KnessetNum` | Int32\|null | Sample: `25` |
| `Name` | String\|null | Hebrew Knesset name (sample: `העשרים וחמש`) |
| `Assembly` | Int32\|null | Assembly (כנס) number (sample: `1`) |
| `Plenum` | Int32\|null | Plenum number (sample: `1`) |
| `PlenumStart` | DateTime\|null | Sample: `2022-11-15T00:00:00` |
| `PlenumFinish` | DateTime\|null | Sample: `2023-04-02T00:00:00` |
| `IsCurrent` | Boolean\|null | `true` = currently sitting (multiple rows can be `true`) |
| `LastUpdatedDate` | DateTime\|null | ISO |

Example — current-Knesset session windows:
```
https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_KnessetDates?$filter=IsCurrent%20eq%20true&$format=json
```

---

## Appendix — remaining EntityTypes (DOCUMENTED-ONLY)

All 38 EntityTypes are present in `$metadata`. The 19 below were **not** live-probed; fields/keys are
copied verbatim from `$metadata` (fetched 2026-06-11). Document entities all share the same shape:
`{<Pk>Id (Int64), <parent>ID (Int32), GroupTypeID (Byte), GroupTypeDesc, ApplicationID (Byte),
ApplicationDesc, FilePath, LastUpdatedDate}`. Their `FilePath` points at `fs.knesset.gov.il`; some use
backslashes — normalize before use. Note Document PK ids are **Int64** (likely serialize as JSON strings,
like `KNS_MkSiteCode.MKSiteCode` — confirm on first use).

| Entity | Key | Notable fields (from `$metadata`) | Purpose (1 line) |
|---|---|---|---|
| `KNS_BillHistoryInitiator` | `BillHistoryInitiatorID` | `BillID`, `PersonID`, `IsInitiator`, `StartDate`, `EndDate`, `ReasonID`, `ReasonDesc` | Former initiators who left a bill (e.g. MK departed mid-term) |
| `KNS_BillName` | `BillNameID` | `BillID`, `Name`, `NameHistoryTypeID`, `NameHistoryTypeDesc` | Alternative/stage names a bill acquires through readings |
| `KNS_BillSplit` | `BillSplitID` | `MainBillID`, `SplitBillID`, `Name` | Maps an original bill to a split-off offspring bill |
| `KNS_BillUnion` | `BillUnionID` | `MainBillID`, `UnionBillID` | Maps a unified bill to a constituent merged bill |
| `KNS_JointCommittee` | `JointCommitteeID` (**Int64**) | `CommitteeID`, `ParticipantCommitteeID` | Joint sessions where two committees meet together |
| `KNS_CmtSiteCode` | `CmtSiteCode` (**Int64**) | `KnsID` (=CommitteeID), `SiteId` | Maps `CommitteeID` to legacy website committee id |
| `KNS_IsraelLaw` | `IsraelLawID` | `KnessetNum`, `Name`, `IsBasicLaw`, `IsFavoriteLaw`, `IsBudgetLaw`, `LawValidityID/Desc`, `ValidityStart/FinishDate`, `PublicationDate` | Enacted laws on the books (distinct from bills) |
| `KNS_IsraelLawBinding` | `IsraelLawBinding` | `IsraelLawID`, `IsraelLawReplacedID`, `LawID`, `LawTypeID` | Links an enacted law to the bills that created/amended it |
| `KNS_IsraelLawClassificiation` | `LawClassificiationID` | `IsraelLawID`, `ClassificiationID`, `ClassificiationDesc` | Topic/classification tags on laws (**metadata typo `Classificiation` — use as-is**) |
| `KNS_IsraelLawMinistry` | `LawMinistryID` | `IsraelLawID`, `GovMinistryID` | Maps enacted laws to responsible ministries |
| `KNS_IsraelLawName` | `IsraelLawNameID` | `IsraelLawID`, `LawID`, `LawTypeID`, `Name` | Name-linkage between an enacted law and its bill version(s) |
| `KNS_Law` | `LawID` | `TypeID/Desc`, `SubTypeID/Desc`, `KnessetNum`, `Name`, `PublicationDate`, `PublicationSeriesID/Desc`, `MagazineNumber` (String), `PageNumber` (String) | Historical / pre-state laws (Mandatory, Ottoman) — `KnessetNum` null for pre-Knesset |
| `KNS_LawBinding` | `LawBindingID` | `LawID`, `IsraelLawID`, `ParentLawID`, `LawTypeID`, `LawParentTypeID`, `BindingType/Desc`, `AmendmentType/Desc` | Detailed law-amendment / binding graph |
| `KNS_DocumentBill` | `DocumentBillID` (**Int64**) | `BillID`, + shared doc fields | Documents attached to bills |
| `KNS_DocumentCommitteeSession` | `DocumentCommitteeSessionID` (**Int64**) | `CommitteeSessionID`, + shared doc fields | Documents (protocols, agendas) on committee sessions |
| `KNS_DocumentPlenumSession` | `DocumentPlenumSessionID` (**Int64**) | `PlenumSessionID`, + shared doc fields | Documents (transcripts, agendas) on plenum sessions |
| `KNS_DocumentQuery` | `DocumentQueryID` (**Int64**) | `QueryID`, + shared doc fields | Documents (query + response text) on queries |
| `KNS_DocumentAgenda` | `DocumentAgendaID` (**Int64**) | `AgendaID`, + shared doc fields | Documents on agenda motions |
| `KNS_DocumentIsraelLaw` | `DocumentIsraelLawID` (**Int64**) | `IsraelLawID`, + shared doc fields | Documents on enacted laws |
| `KNS_DocumentLaw` | `DocumentLawID` (**Int64**) | `LawID`, + shared doc fields | Documents on historical/pre-state laws |

(That table is 20 rows; combined with the 18 detailed entities above = the full 38, with
`KNS_DocumentLaw` and `KNS_CmtSessionItem` appearing once each in their respective sections.)

---

## Votes.svc — frozen at K24

Base URL: `https://knesset.gov.il/Odata/Votes.svc/`

**Status: frozen at the 24th Knesset (verified 2026-06-11).** `View_vote_rslts_hdr_Approved?$orderby=vote_date desc&$top=1`
→ `vote_id 34515, knesset_num 24, vote_date 2021-07-13`. `…/$count?$filter=knesset_num eq 25` → `0`.
**For K25 votes use the WebSiteApi** (next section). This service is documented here for completeness only.

`$metadata` declares **4 EntityTypes** (all VERIFIED to exist; field types from its `$metadata`):

### View_vote_rslts_hdr_Approved (key `vote_id`)
Vote header — one row per plenum vote, with outcome + totals.
`vote_id` (Int32) · `knesset_num` (Int16) · `session_id` (**Decimal**) · `sess_item_nbr` (Int16) ·
`sess_item_id` (**Decimal**) · `sess_item_dscr` (String) · `vote_item_id` (**Decimal**) · `vote_item_dscr` (String) ·
`vote_date` (DateTime) · `vote_time` (String) · `is_elctrnc_vote` (Byte) · `vote_type` (Byte) ·
`is_accepted` (Byte) · `total_for` (Int16) · `total_against` (Int16) · `total_abstain` (Int16) ·
`vote_stat` (Byte) · `session_num` (Int32) · `vote_nbr_in_sess` (Int16) · `reason` (Byte) · `modifier` (String) · `remark` (String).

### vote_rslts_kmmbr_shadow (composite key `kmmbr_id,vote_id`)
Per-MK vote results (K24 and earlier only). One row per MK per vote.
`vote_id` (Int32) · `kmmbr_id` (String — zero-padded legacy MK id) · `kmmbr_name` (String) ·
`vote_result` (Int16) · `knesset_num` (Int16) · `faction_id` (Int16) · `faction_name` (String) ·
`reason` (Byte) · `modifier` (String) · `remark` (String).

### View_Vote_MK_Individual (key `vip_id`)
MK identity map for the Votes.svc id space.
`vip_id` (String — zero-padded) · `mk_individual_id` (Int32) · `mk_individual_name` (String) ·
`mk_individual_name_eng` (String) · `mk_individual_first_name` (String) · `mk_individual_first_name_eng` (String).

### vote_result_type (key `result_type_id`)
Lookup for `vote_rslts_kmmbr_shadow.vote_result`.
`result_type_id` (Int32) · `result_type_name` (String).

**Id-space warning:** `kmmbr_id` / `vip_id` (Votes.svc) ≠ `PersonID` (ParliamentInfo.svc) ≠ `mk_individual_id`
(Open Knesset) ≠ the WebSiteApi dropdown id. Do not join across them.

---

## Cross-reference: knesset-votes skill (WebSiteApi)

For **K25 (current Knesset) roll-call votes**, `Votes.svc` is unusable. The live source is the Knesset's
own website backend API. Full details in
[`.claude/skills/knesset-votes/SKILL.md`](../../knesset-votes/SKILL.md).

| Call | Purpose |
|---|---|
| `POST https://knesset.gov.il/WebSiteApi/knessetapi/Votes/GetVotesHeaders` body `{"SearchType":2,"FromDate":"YYYY-MM-DD","ToDate":"YYYY-MM-DD"}` | Vote headers for a date window → `{Table:[{VoteId, VoteDate, VoteType, ItemTitle, KnessetId, …}]}` |
| `GET https://knesset.gov.il/WebSiteApi/knessetapi/Votes/GetVoteDetails/{voteId}` | Full detail: `VoteHeader[0]` (`FK_ItemID` == `KNS_Bill.BillID` for bill votes) + `VoteCounters` + `VoteDetails[{MkName, FactionName, VoteResultId, Title}]` |
| `GET https://knesset.gov.il/WebSiteApi/knessetapi/MKs/GetMksDropDown?languagekey=he` | Every MK ever `{ID, Name, IsCurrent}` — website id space, **not** OData `PersonID` |

The per-MK `VoteDetails` rows carry only a Hebrew name (no stable id); attribution to `PersonID` goes
through the human-verified `mk_name_mappings` table. See the knesset-votes skill for normalization,
attribution, and ingest specifics.

---

## OData Mechanics & Gotchas

All items below were **verified live on ParliamentInfo.svc, 2026-06-11**, unless marked otherwise.

1. **`$format=json` is mandatory.** Without it the service returns Atom/XML. The app's `buildODataUrl`
   always sets it.

2. **Page cap = 100 rows, with a paging quirk.** The service caps every response at 100 rows. If you ask
   for `$top=100` and exactly 100 come back, it emits **no** `nextLink` (it reads `$top` as "you asked for
   100, here they are"). To page to exhaustion, request a `$top` **larger than the server cap** (the app
   uses `$top=100000`); the service then returns 100 rows + a `nextLink` that decrements the remaining
   `$top` and carries a `$skiptoken`, repeating until drained.

3. **`nextLink` is RELATIVE.** The paging link comes back as `odata.nextLink` relative to the service root
   (e.g. `KNS_Faction?$top=...&$skiptoken=...`). Resolve it against the base URL before the follow-up fetch.
   The app reads both `odata.nextLink` and (v3) `d.__next`.

4. **Counts without downloading rows: `$inlinecount=allpages&$top=1`.** Reads `odata.count` from the
   response (verified → `KNS_BillInitiator?$filter=PersonID eq 30300&$inlinecount=allpages` → `"213"`).

5. **`$count=true` is UNSUPPORTED → HTTP 400.** Verified: returns
   `"The query parameter '$count' begins with a system-reserved '$' character but is not recognized."`
   This is the OData **v4** count syntax; this service does not accept it.

6. **The `/$count` PATH works but is content-type-picky.** `GET <Entity>/$count?$filter=...` returns a bare
   plaintext integer — **but only with `Accept: text/plain`** (verified → `KNS_Person/$count?$filter=IsCurrent eq true`
   → `139`). Sending `Accept: application/json` to `/$count` returns **HTTP 415** "Unsupported media type
   requested." (verified).

7. **`odata.count` is a STRING.** The JSON value is `"213"` / `"545"`, not a number (verified twice).
   Coerce with `Number()` before arithmetic.

8. **Text search: use v3 `substringof('x', Field)`, NOT v4 `contains(Field,'x')`.** Verified:
   `substringof('אוחנה',LastName)` returns rows (PersonID 585 + 30300); `contains(LastName,'אוחנה')`
   returns **HTTP 400** `"An unknown function with name 'contains' was found."` This service is OData v3 for
   filter functions — `contains()` does not exist here. (Use ILIKE/trigram for *discovery* only; commit
   facts by stable id — project sourcing rule.)

9. **URL-encoding: prefer `%20` for spaces; never rely on `+`.** The app percent-encodes manually with
   `encodeURIComponent` (NOT `URLSearchParams`, which form-encodes spaces as `+`). In live probing the
   service *did* decode `+` to a space for simple `eq` filters and for spaces inside Hebrew literals — but
   `+` is ambiguous (a literal `+` in a value would be wrong), and `%20` is unambiguous and is the project
   convention. **Always emit `%20`.**

10. **`$expand` stays within a single service.** You can expand across ParliamentInfo.svc nav properties,
    but you cannot `$expand` from ParliamentInfo.svc into Votes.svc (separate services).

11. **`KNS_BillInitiator` has no `KnessetNum`.** Scope it by Knesset via the nav property:
    `KNS_Bill/KnessetNum eq 25` (encoded `KNS_Bill%2FKnessetNum%20eq%2025`). `KNS_Query`, by contrast, has
    a direct `KnessetNum`.

12. **Serialization quirks (verified):** Int64 keys come back as JSON **strings** — `KNS_MkSiteCode.MKSiteCode`
    serialized as `"943"`. `KNS_PlmSessionItem.Ordinal` (declared Int64) serialized as `"1"`. `DateTime`
    fields are plain ISO strings with no timezone (`2022-11-10T11:19:09.353`), **not** `/Date(ms)/` — parse
    as naive local. Treat any Int64-declared field as possibly-string in JSON.

13. **`$metadata` typos are real field names.** `KNS_IsraelLawClassificiation` (double-i), and
    `KNS_Agenda.PostopenmentReasonID/Desc` (`Postopenment`) — use them verbatim; they are not transcription
    errors here.

14. **Sentinel garbage rows.** `FactionID 911` in `KNS_Faction` is a known junk row — the ingest drops it.
    Faction `Name` values can carry a trailing space (`"הליכוד "`) — trim on ingest.

15. **Current Knesset = 25 (verified 2026-06-11):** `KNS_Bill/$count?$filter=KnessetNum eq 26` → `0`;
    `eq 25` → `7434`. Bump `CURRENT_KNESSET` in `app/lib/knesset/odata.ts` when K26 is seated.

---

## Official sources & documentation

- **Service root / the only first-party "docs":** `https://knesset.gov.il/Odata/ParliamentInfo.svc/`
  (entity list) and its `$metadata` document. **There is no official human-readable API documentation
  page** — the OData metadata is the only authoritative schema source (confirmed via web search 2026-06-11).
- **Votes service root:** `https://knesset.gov.il/Odata/Votes.svc/` (frozen at K24).
- **Community documentation / wrappers:**
  - [hasadna/knesset-data](https://github.com/hasadna/knesset-data) — APIs + docs for Knesset data.
  - [hasadna/knesset-data-python](https://github.com/hasadna/knesset-data-python) — Python module wrapping the OData.
  - [Open Knesset API docs](https://oknesset-api.readthedocs.io/) — the Open Knesset mirror (derived from the official OData).
  - [Noa Lidor, "Analyzing THE KNESSET (O)Data" (Medium)](https://medium.com/@noalidor91/analyzing-the-knesset-o-data-792e75935090) — informal walkthrough.
- **License:** no machine-readable reuse license is published on the OData service — obtain written
  confirmation before public launch (per `docs/decisions/knesset-data.md`).
</content>
