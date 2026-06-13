import type {
  KnsFaction, KnsPerson, KnsPersonToPosition, KnsPosition, KnsBill, KnsBillInitiator, KnsDocumentBill, KnsStatus, KnsBillInitiatorExpanded, KnsQuery, KnsCommittee,
} from "./odata-types";
import { normalizeSearchName } from "./search-name";
import { logger } from "@/app/lib/logger";

export interface Prov { sourceUrl: string; fetchedAt: Date }

// PositionID codes (verified against KNS_Position 2026-06-11): 43/61 = MK;
// 54 = faction membership (carries party); 39 שר / 57 שרה / 40 סגן שר /
// 59 סגנית שר / 45 ראש הממשלה / 50 סגן ראש הממשלה = government office.
// Norwegian-law ministers RESIGN their MK seat — "currently serving" must
// mean MK seat OR government office, or sitting ministers (Regev, Smotrich,
// Sa'ar…) vanish from every gallery. Administrative Knesset staff hold other
// ids (33/46/724/779/817/23119 — legal advisor, secretary…) and stay out.
export const MK_POSITIONS = new Set([43, 61]);
export const GOV_POSITIONS = new Set([39, 40, 45, 50, 57, 59]);
export const FACTION_MEMBER_POSITION = 54;
export const SENTINEL_FACTION_ID = 911;

/** Parses OData v3 "/Date(ms)/" or an ISO string into a Date (naive, as-stored). */
export function parseODataDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = /\/Date\((-?\d+)\)\//.exec(v);
  if (m) return new Date(Number(m[1]));
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** en-CA yields YYYY-MM-DD; we pin the zone so the epoch instant resolves to its
 * Asia/Jerusalem wall-clock calendar day (matching the naive ISO branch). */
const JERUSALEM_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
});

/**
 * YYYY-MM-DD (date-only column) from an OData date string. We slice the
 * wall-clock fields directly off the source (treating it as naive
 * Asia/Jerusalem, per the time rule) rather than going through toISOString()
 * — that would apply a UTC offset and can shift the calendar day.
 */
function toDateOnly(v: string | null | undefined): string | null {
  if (!v) return null;
  // OData /Date(ms)/ epoch form: resolve the instant to its Asia/Jerusalem
  // wall-clock day (NOT UTC toISOString, which can shift the calendar day) so
  // it stays consistent with the naive ISO branch below.
  const epoch = /\/Date\((-?\d+)\)\//.exec(v);
  if (epoch) {
    const d = new Date(Number(epoch[1]));
    return isNaN(d.getTime()) ? null : JERUSALEM_DAY.format(d);
  }
  // ISO/plain form: take the leading YYYY-MM-DD verbatim (naive wall-clock).
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  if (iso) return iso[1];
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : JERUSALEM_DAY.format(d);
}

export function buildPositionLabelMap(rows: KnsPosition[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const r of rows) if (r.Description) m.set(r.PositionID, r.Description);
  return m;
}

export interface FactionRow {
  factionId: number; nameHe: string; knessetNum: number | null; isCurrent: boolean;
  sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}

export function normalizeFactions(raw: KnsFaction[], prov: Prov): FactionRow[] {
  return raw
    .filter((f) => f.FactionID !== SENTINEL_FACTION_ID) // drop "אין נתונים"
    .map((f) => ({
      factionId: f.FactionID,
      nameHe: f.Name,
      knessetNum: f.KnessetNum ?? null,
      isCurrent: f.IsCurrent ?? false,
      sourceDataset: "KNS_Faction",
      sourceUrl: prov.sourceUrl,
      fetchedAt: prov.fetchedAt,
    }));
}

export interface MemberRow {
  personId: number; nameHe: string; nameEn: string | null; party: string | null;
  factionId: number | null; roleHe: string | null; inKnessetSince: string | null;
  dob: string | null; facts: Record<string, unknown>; active: boolean; searchName: string;
  sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}

interface NormalizeMembersArgs {
  p2p: KnsPersonToPosition[];
  positionLabels: Map<number, string>;
  prov: Prov;
  persons?: KnsPerson[];   // optional Hebrew-name source (KNS_Person)
  factionNameById?: Map<number, string>; // FactionID -> KNS_Faction.Name (party, by stable id)
}

/**
 * The K25-TENURE recipe (supersedes the IsCurrent-only roster for the votes
 * feature): input is ALL `KnessetNum eq 25` PersonToPosition rows (verified:
 * no current row has a NULL KnessetNum, so nothing is missed), roster = any
 * person with a 43/61 row in the term — INCLUDING departed MKs (Norwegian-law
 * churn, resignations), who get `active=false`. The K25 vote backfill spans
 * ~3.5 years; without the departed, their roll-call rows could never attribute.
 *
 * Per person: `active` = has a current 43/61 row. Faction/roles prefer current
 * rows (preserving the existing card data for the 120 actives) and fall back
 * to the latest K25 rows for the departed. inKnessetSince = MIN(StartDate) of
 * all 54 rows. Faction NULL (or the 911 sentinel) stays NULL.
 */
export function normalizeK25Members({ p2p, positionLabels, prov, persons = [], factionNameById }: NormalizeMembersArgs): MemberRow[] {
  const byPersonAll = new Map<number, KnsPersonToPosition[]>();
  for (const r of p2p) {
    const list = byPersonAll.get(r.PersonID) ?? [];
    list.push(r);
    byPersonAll.set(r.PersonID, list);
  }
  const nameByPerson = new Map<number, string>();
  for (const p of persons) {
    const he = [p.FirstName, p.LastName].filter(Boolean).join(" ").trim();
    if (he) nameByPerson.set(p.PersonID, he);
  }

  const out: MemberRow[] = [];
  for (const [personId, allRows] of byPersonAll) {
    const mkRows = allRows.filter((r) => MK_POSITIONS.has(r.PositionID));
    const govRows = allRows.filter((r) => GOV_POSITIONS.has(r.PositionID));
    if (!mkRows.length && !govRows.length) continue; // roster = MK seat OR gov office this term
    // Serving = current MK seat OR current government office (Norwegian law).
    const active = mkRows.some((r) => r.IsCurrent === true) || govRows.some((r) => r.IsCurrent === true);
    // Actives keep the proven current-rows recipe; departed use their K25 history.
    const rows = active ? allRows.filter((r) => r.IsCurrent === true) : allRows;

    const factionRows = allRows.filter((r) => r.PositionID === FACTION_MEMBER_POSITION);
    const factionCandidates = factionRows.filter((r) => r.FactionID != null && r.FactionID !== SENTINEL_FACTION_ID);
    const factionRow =
      factionCandidates.find((r) => r.IsCurrent === true) ??
      factionCandidates
        .slice()
        .sort((a, b) => (toDateOnly(b.StartDate) ?? "").localeCompare(toDateOnly(a.StartDate) ?? ""))[0] ??
      null;
    const factionId = factionRow?.FactionID ?? null;
    let party: string | null = null;
    if (factionId != null) {
      const joined = factionNameById?.get(factionId) ?? null;
      const inline = factionRow?.FactionName ?? null;
      if (joined != null && inline != null && joined !== inline) {
        logger.warn("knesset.normalize.faction_name_mismatch", { factionId, joined, inline });
      }
      party = joined ?? inline;
    }

    const startDates = factionRows.map((r) => toDateOnly(r.StartDate)).filter((d): d is string => !!d);
    const inKnessetSince = startDates.length ? startDates.sort()[0] : null; // MIN

    const roleRows = rows.filter((r) => !MK_POSITIONS.has(r.PositionID) && r.PositionID !== FACTION_MEMBER_POSITION);
    const roles = roleRows
      .map((r) => positionLabels.get(r.PositionID))
      .filter((l): l is string => !!l);
    const ministries = roleRows.map((r) => r.GovMinistryName).filter((m): m is string => !!m);
    const committeesNamed = roleRows.map((r) => r.CommitteeName).filter((c): c is string => !!c);

    const nameHe = nameByPerson.get(personId) ?? "";
    out.push({
      personId,
      nameHe,
      nameEn: null,
      party,
      factionId,
      roleHe: roles[0] ?? null,
      inKnessetSince,
      dob: null,
      facts: { roles, ministries, committees: committeesNamed },
      active,
      searchName: normalizeSearchName(nameHe),
      sourceDataset: "KNS_PersonToPosition",
      sourceUrl: prov.sourceUrl,
      fetchedAt: prov.fetchedAt,
    });
  }
  return out.sort((a, b) => a.personId - b.personId);
}

/**
 * The CONFIRMED current-members recipe. Roster = current 43/61 rows (dedup by
 * PersonID). Party = same person's current 54 row (FactionID/FactionName).
 * Roles = the person's other current rows, labelled via KNS_Position.Description.
 * inKnessetSince = MIN(StartDate) of the person's 54 rows. Faction NULL stays NULL.
 */
export function normalizeCurrentMembers({ p2p, positionLabels, prov, persons = [], factionNameById }: NormalizeMembersArgs): MemberRow[] {
  const current = p2p.filter((r) => r.IsCurrent === true);
  const byPerson = new Map<number, KnsPersonToPosition[]>();
  for (const r of current) {
    const list = byPerson.get(r.PersonID) ?? [];
    list.push(r);
    byPerson.set(r.PersonID, list);
  }
  const nameByPerson = new Map<number, string>();
  for (const p of persons) {
    const he = [p.FirstName, p.LastName].filter(Boolean).join(" ").trim();
    if (he) nameByPerson.set(p.PersonID, he);
  }

  const out: MemberRow[] = [];
  for (const [personId, rows] of byPerson) {
    const isMK = rows.some((r) => MK_POSITIONS.has(r.PositionID));
    if (!isMK) continue; // roster = 43/61 only

    // Exclude the 911 sentinel ("אין נתונים"): a 911-only person carries no real
    // faction, so factionId/party stay NULL (matches normalizeFactions' drop).
    const factionRows = rows.filter((r) => r.PositionID === FACTION_MEMBER_POSITION);
    const factionRow = factionRows.find((r) => r.FactionID != null && r.FactionID !== SENTINEL_FACTION_ID) ?? null;
    const factionId = factionRow?.FactionID ?? null;
    // Party resolves by stable id through KNS_Faction.Name, never the inline
    // FactionName string. We warn (not fail) when they disagree, then fall back
    // to the inline name only if the id is absent from the map.
    let party: string | null = null;
    if (factionId != null) {
      const joined = factionNameById?.get(factionId) ?? null;
      const inline = factionRow?.FactionName ?? null;
      if (joined != null && inline != null && joined !== inline) {
        logger.warn("knesset.normalize.faction_name_mismatch", { factionId, joined, inline });
      }
      party = joined ?? inline;
    }

    const startDates = factionRows.map((r) => toDateOnly(r.StartDate)).filter((d): d is string => !!d);
    const inKnessetSince = startDates.length ? startDates.sort()[0] : null; // MIN

    // roles: rows that are neither roster (43/61) nor the faction-membership (54)
    const roleRows = rows.filter((r) => !MK_POSITIONS.has(r.PositionID) && r.PositionID !== FACTION_MEMBER_POSITION);
    const roles = roleRows
      .map((r) => positionLabels.get(r.PositionID))
      .filter((l): l is string => !!l);
    const ministries = roleRows.map((r) => r.GovMinistryName).filter((m): m is string => !!m);
    const committeesNamed = roleRows.map((r) => r.CommitteeName).filter((c): c is string => !!c);
    const roleHe = roles[0] ?? null;

    const nameHe = nameByPerson.get(personId) ?? "";
    out.push({
      personId,
      nameHe,
      nameEn: null, // gap-filled later from Open Knesset, reconciled by personId
      party,
      factionId,
      roleHe,
      inKnessetSince,
      dob: null,    // not in OData
      facts: { roles, ministries, committees: committeesNamed },
      active: true,
      searchName: normalizeSearchName(nameHe),
      sourceDataset: "KNS_PersonToPosition",
      sourceUrl: prov.sourceUrl,
      fetchedAt: prov.fetchedAt,
    });
  }
  return out.sort((a, b) => a.personId - b.personId);
}

// --- straight per-entity mappers (1:1, provenance-stamped) ---

export interface BillRow {
  billId: number; knessetNum: number | null; nameHe: string;
  subTypeId: number | null; subTypeDesc: string | null; privateNumber: number | null;
  committeeId: number | null; number: number | null; statusId: number | null;
  publicationDate: Date | null; summaryLaw: string | null; isContinuationBill: boolean | null;
  publicationSeriesDesc: string | null; lastUpdatedDate: Date | null;
  sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeBills(raw: KnsBill[], prov: Prov): BillRow[] {
  return raw.map((b) => ({
    billId: b.BillID, knessetNum: b.KnessetNum ?? null, nameHe: b.Name,
    subTypeId: b.SubTypeID ?? null, subTypeDesc: b.SubTypeDesc ?? null,
    privateNumber: b.PrivateNumber ?? null, committeeId: b.CommitteeID ?? null,
    number: b.Number ?? null, statusId: b.StatusID ?? null,
    publicationDate: parseODataDate(b.PublicationDate),
    summaryLaw: b.SummaryLaw ?? null, isContinuationBill: b.IsContinuationBill ?? null,
    publicationSeriesDesc: b.PublicationSeriesDesc ?? null,
    lastUpdatedDate: parseODataDate(b.LastUpdatedDate),
    sourceDataset: "KNS_Bill", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

export interface BillSponsorRow {
  billInitiatorId: number; billId: number; personId: number; isInitiator: boolean;
  ordinal: number | null; sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
/**
 * Normalizes initiator rows. When `validBillIds` is given, rows referencing a
 * bill NOT in that set are dropped — guaranteeing referential integrity against
 * the (K25-scoped) `bills` table. This matters because KNS_BillInitiator spans
 * every Knesset (~170k rows) while `bills` holds only the current Knesset; an
 * unfiltered ingest both blows past the 100k page cap AND seeds orphan rows that
 * never join, so the recent-bills list renders empty and counts are dishonest.
 */
export function normalizeBillSponsors(
  raw: KnsBillInitiator[],
  prov: Prov,
  validBillIds?: ReadonlySet<number>,
): BillSponsorRow[] {
  const rows = validBillIds ? raw.filter((r) => validBillIds.has(r.BillID)) : raw;
  return rows.map((r) => ({
    billInitiatorId: r.BillInitiatorID, billId: r.BillID, personId: r.PersonID,
    isInitiator: r.IsInitiator ?? false, ordinal: r.Ordinal ?? null,
    sourceDataset: "KNS_BillInitiator", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

export interface BillDocumentRow {
  documentBillId: number; billId: number; groupTypeId: number | null; groupTypeDesc: string | null;
  format: string | null; filePath: string; lastUpdatedDate: Date | null;
  sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeBillDocuments(raw: KnsDocumentBill[], prov: Prov): BillDocumentRow[] {
  return raw.map((d) => ({
    documentBillId: d.DocumentBillID, billId: d.BillID,
    groupTypeId: d.GroupTypeID ?? null, groupTypeDesc: d.GroupTypeDesc ?? null,
    format: d.ApplicationDesc ?? null, filePath: d.FilePath,
    lastUpdatedDate: parseODataDate(d.LastUpdatedDate),
    sourceDataset: "KNS_DocumentBill", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

export interface BillStatusRow {
  statusId: number; descHe: string; sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeBillStatuses(raw: KnsStatus[], prov: Prov): BillStatusRow[] {
  return raw.map((s) => ({
    statusId: s.StatusID, descHe: s.Desc,
    sourceDataset: "KNS_Status", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

/** Flattens `$expand=KNS_Bill/KNS_DocumentBills` rows into the three raw arrays
 *  the upserts need: bills (deduped by BillID), sponsors (every initiator row),
 *  documents (deduped by DocumentBillID+ApplicationDesc). Pure — caller normalizes. */
export function splitExpandedInitiators(raw: KnsBillInitiatorExpanded[]): {
  bills: KnsBill[]; sponsors: KnsBillInitiator[]; documents: KnsDocumentBill[];
} {
  const billsById = new Map<number, KnsBill>();
  const documentsByKey = new Map<string, KnsDocumentBill>();
  const sponsors: KnsBillInitiator[] = [];
  for (const r of raw) {
    sponsors.push({
      BillInitiatorID: r.BillInitiatorID, BillID: r.BillID, PersonID: r.PersonID,
      IsInitiator: r.IsInitiator ?? null, Ordinal: r.Ordinal ?? null, LastUpdatedDate: r.LastUpdatedDate ?? null,
    });
    const b = r.KNS_Bill;
    if (!b) continue;
    if (!billsById.has(b.BillID)) {
      const { KNS_DocumentBills: _omit, ...bill } = b;
      billsById.set(b.BillID, bill);
    }
    for (const d of b.KNS_DocumentBills ?? []) {
      documentsByKey.set(`${d.DocumentBillID}:${d.ApplicationDesc ?? ""}`, d);
    }
  }
  return { bills: [...billsById.values()], sponsors, documents: [...documentsByKey.values()] };
}

export interface QueryRow {
  queryId: number; number: number | null; knessetNum: number | null; nameHe: string | null;
  typeDesc: string | null; statusId: number | null; personId: number; govMinistryId: number | null;
  submitDate: Date | null; sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeQueries(raw: KnsQuery[], prov: Prov): QueryRow[] {
  return raw.map((q) => ({
    queryId: q.QueryID, number: q.Number ?? null, knessetNum: q.KnessetNum ?? null, nameHe: q.Name ?? null,
    typeDesc: q.TypeDesc ?? null, statusId: q.StatusID ?? null, personId: q.PersonID,
    govMinistryId: q.GovMinistryID ?? null, submitDate: parseODataDate(q.SubmitDate),
    sourceDataset: "KNS_Query", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

export interface CommitteeRow {
  committeeId: number; nameHe: string; categoryDesc: string | null; knessetNum: number | null;
  committeeTypeDesc: string | null; parentCommitteeId: number | null; isCurrent: boolean;
  sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeCommittees(raw: KnsCommittee[], prov: Prov): CommitteeRow[] {
  return raw.map((c) => ({
    committeeId: c.CommitteeID, nameHe: c.Name, categoryDesc: c.CategoryDesc ?? null,
    knessetNum: c.KnessetNum ?? null, committeeTypeDesc: c.CommitteeTypeDesc ?? null,
    parentCommitteeId: c.ParentCommitteeID ?? null, isCurrent: c.IsCurrent ?? false,
    sourceDataset: "KNS_Committee", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

export interface CommitteeMembershipRow {
  committeeId: number; personId: number; positionId: number;
  startDate: string | null; finishDate: string | null;
  sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
/** From Open Knesset mk_individual_committees.csv (reconciled by PersonID). */
export function normalizeCommitteeMemberships(
  csvRows: Record<string, string>[], sourceUrl: string, fetchedAt: Date,
): CommitteeMembershipRow[] {
  return csvRows
    .map((r) => ({
      committeeId: Number(r.committee_id ?? r.CommitteeID),
      personId: Number(r.mk_individual_id ?? r.PersonID ?? r.personId),
      positionId: Number(r.position_id ?? r.PositionID ?? "0"),
      startDate: r.start_date ? r.start_date.slice(0, 10) : null,
      finishDate: r.finish_date ? r.finish_date.slice(0, 10) : null,
      sourceDataset: "oknesset:mk_individual_committees.csv",
      sourceUrl, fetchedAt,
    }))
    .filter((m) => Number.isFinite(m.committeeId) && Number.isFinite(m.personId));
}

export interface FactionStintRow {
  personToPositionId: number; personId: number; factionId: number; knessetNum: number;
  startDate: Date; finishDate: Date | null;
  sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
/**
 * Faction-membership intervals (PositionID 54) — the faction-AT-VOTE-TIME
 * source for mk_votes attribution: a vote dated inside [startDate, finishDate)
 * belongs to that stint's faction. Rows without a usable StartDate or carrying
 * the 911 sentinel are dropped (they can't anchor an interval).
 */
export function normalizeFactionStints(raw: KnsPersonToPosition[], prov: Prov): FactionStintRow[] {
  const out: FactionStintRow[] = [];
  for (const r of raw) {
    if (r.PositionID !== FACTION_MEMBER_POSITION) continue;
    if (r.FactionID == null || r.FactionID === SENTINEL_FACTION_ID) continue;
    if (r.KnessetNum == null) continue;
    const startDate = parseODataDate(r.StartDate);
    if (!startDate) continue;
    out.push({
      personToPositionId: r.PersonToPositionID,
      personId: r.PersonID,
      factionId: r.FactionID,
      knessetNum: r.KnessetNum,
      startDate,
      finishDate: parseODataDate(r.FinishDate),
      sourceDataset: "KNS_PersonToPosition",
      sourceUrl: prov.sourceUrl,
      fetchedAt: prov.fetchedAt,
    });
  }
  return out;
}

/** Applies Open Knesset English names onto members, reconciling by PersonID. */
export function applyEnglishNames(
  members: MemberRow[], csvRows: Record<string, string>[],
): MemberRow[] {
  const enByPerson = new Map<number, string>();
  for (const r of csvRows) {
    const id = Number(r.mk_individual_id ?? r.PersonID ?? r.personId);
    const en = r.mk_individual_name_eng ?? r.name_eng ?? "";
    if (Number.isFinite(id) && en) enByPerson.set(id, en);
  }
  return members.map((m) => ({ ...m, nameEn: enByPerson.get(m.personId) ?? m.nameEn }));
}
