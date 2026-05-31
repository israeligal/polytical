import type {
  KnsFaction, KnsPerson, KnsPersonToPosition, KnsPosition, KnsBill, KnsBillInitiator, KnsQuery, KnsCommittee,
} from "./odata-types";
import { normalizeSearchName } from "./search-name";
import { logger } from "@/app/lib/logger";

export interface Prov { sourceUrl: string; fetchedAt: Date }

// PositionID codes (verified): 43/61 = MK; 54 = faction membership (carries party).
export const MK_POSITIONS = new Set([43, 61]);
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
  billId: number; knessetNum: number | null; nameHe: string; subTypeDesc: string | null;
  statusId: number | null; sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeBills(raw: KnsBill[], prov: Prov): BillRow[] {
  return raw.map((b) => ({
    billId: b.BillID, knessetNum: b.KnessetNum ?? null, nameHe: b.Name,
    subTypeDesc: b.SubTypeDesc ?? null, statusId: b.StatusID ?? null,
    sourceDataset: "KNS_Bill", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

export interface BillSponsorRow {
  billInitiatorId: number; billId: number; personId: number; isInitiator: boolean;
  ordinal: number | null; sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeBillSponsors(raw: KnsBillInitiator[], prov: Prov): BillSponsorRow[] {
  return raw.map((r) => ({
    billInitiatorId: r.BillInitiatorID, billId: r.BillID, personId: r.PersonID,
    isInitiator: r.IsInitiator ?? false, ordinal: r.Ordinal ?? null,
    sourceDataset: "KNS_BillInitiator", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
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
