import { db as defaultDb } from "@/app/lib/db";
import type { AppDb } from "@/app/lib/db-utils";
import { getMembership, listMyGroups } from "@/app/lib/groups/repo";
import type { GroupVoteStance } from "@/app/lib/groups/stance-consent-repo";
import * as consent from "@/app/lib/groups/stance-consent-repo";
import { NotGroupMemberError } from "@/app/lib/errors";

// Phase 2 stance-sharing service — membership-gates the consent writes, then
// delegates to the repo (which holds the 4-way reveal gate). The reveal read +
// the consent state pass straight through (the repo gates internally).

/** Opt in/out of sharing your stances in a group. Active members only. */
export async function setStanceSharing({
  db = defaultDb,
  groupId,
  userId,
  share,
}: {
  db?: AppDb;
  groupId: string;
  userId: string;
  share: boolean;
}): Promise<void> {
  const membership = await getMembership({ db, groupId, userId });
  if (!membership || membership.status !== "active") throw new NotGroupMemberError();
  if (share) await consent.setConsent({ db, groupId, userId });
  else await consent.clearConsent({ db, groupId, userId });
}

export const getStanceSharing = consent.getConsent;
export const getGroupVoteStances = consent.getGroupVoteStances;
export const getGroupAgendaStances = consent.getGroupAgendaStances;
export const getStanceShareStats = consent.getShareStats;

export interface GroupVoteStancesView {
  group: { id: string; slug: string; nameHe: string; emblem: string | null };
  stances: GroupVoteStance[];
  /** consenting active members / total active members — flags the selection effect. */
  stats: { sharing: number; total: number };
}

/**
 * For the /vote/[id] "how my coalitions voted" block: across the viewer's active
 * groups, the revealed stances on `voteId` — ONLY for groups where the viewer is
 * sharing (the repo gate returns [] otherwise, so those groups are dropped).
 */
export async function getMyGroupsVoteStances({
  db = defaultDb,
  userId,
  voteId,
}: {
  db?: AppDb;
  userId: string;
  voteId: number;
}): Promise<GroupVoteStancesView[]> {
  const groups = await listMyGroups({ db, userId });
  const out: GroupVoteStancesView[] = [];
  for (const g of groups) {
    const stances = await consent.getGroupVoteStances({ db, groupId: g.id, voteId, viewerId: userId });
    if (stances.length === 0) continue; // viewer not sharing here, or nothing to show
    const stats = await consent.getShareStats({ db, groupId: g.id });
    out.push({ group: { id: g.id, slug: g.slug, nameHe: g.nameHe, emblem: g.emblem }, stances, stats });
  }
  return out;
}

/**
 * The agenda (pre-vote) twin of getMyGroupsVoteStances: for the bill page's
 * "coalition's position" block, the revealed pre-vote positions on `agendaItemId`
 * across the viewer's sharing groups. Same gate, same view shape.
 */
export async function getMyGroupsAgendaStances({
  db = defaultDb,
  userId,
  agendaItemId,
}: {
  db?: AppDb;
  userId: string;
  agendaItemId: string;
}): Promise<GroupVoteStancesView[]> {
  const groups = await listMyGroups({ db, userId });
  const out: GroupVoteStancesView[] = [];
  for (const g of groups) {
    const stances = await consent.getGroupAgendaStances({ db, groupId: g.id, agendaItemId, viewerId: userId });
    if (stances.length === 0) continue; // viewer not sharing here, or nothing to show
    const stats = await consent.getShareStats({ db, groupId: g.id });
    out.push({ group: { id: g.id, slug: g.slug, nameHe: g.nameHe, emblem: g.emblem }, stances, stats });
  }
  return out;
}
