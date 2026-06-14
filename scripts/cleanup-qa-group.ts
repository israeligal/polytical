// One-off QA cleanup: hard-delete a single test group created during browser-QA
// on the production DB. Targets by exact id so it can never touch a real group.
// Cascade (markets.groupId, group_members, group_stance_consent → all onDelete
// cascade; user.defaultGroupId → set null) removes the motion + bets/comments.
// Pass the target id as argv[2]. Run with the prod env:
//   pnpm tsx --env-file=.env scripts/cleanup-qa-group.ts <groupId>
import { sharedSql } from "@/app/lib/db";

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error("usage: cleanup-qa-group.ts <groupId>");

  const before = await sharedSql<{ id: string; nameHe: string }[]>`
    select id, "nameHe" from groups where id = ${id}`;
  if (before.length === 0) {
    console.log(JSON.stringify({ status: "not_found", id }));
    await sharedSql.end();
    process.exit(0);
  }
  const motions = await sharedSql`select id from markets where "groupId" = ${id}`;
  const members = await sharedSql`select "userId" from group_members where "groupId" = ${id}`;
  console.log(JSON.stringify({
    target: before[0], motionCount: motions.length, memberCount: members.length,
  }, null, 2));

  await sharedSql`delete from groups where id = ${id}`;

  const after = await sharedSql`select id from groups where id = ${id}`;
  const orphanMotions = await sharedSql`select id from markets where "groupId" = ${id}`;
  console.log(JSON.stringify({
    status: "deleted",
    groupGone: after.length === 0,
    motionsGone: orphanMotions.length === 0,
  }, null, 2));
  await sharedSql.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
