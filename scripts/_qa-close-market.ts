// TEMP QA helper (delete after): seeds ONE throwaway open global market closing in
// 2 days so the duel feed-suggestion card + rematch picker have a candidate to
// render. Clearly labeled. Run: pnpm tsx --env-file=.env scripts/_qa-close-market.ts
// Cleanup: DELETE FROM markets WHERE id = '<printed id>'; (cascades outcomes)
import { sharedSql } from "@/app/lib/db";

async function main() {
  const [m] = await sharedSql<{ id: string }[]>`
    insert into markets ("questionHe", category, type, status, hot, "closeAt")
    values ('QA קרוב — נא להתעלם (דו-קרב)', 'other', 'binary', 'open', false, now() + interval '2 days')
    returning id`;
  await sharedSql`insert into outcomes ("marketId","labelHe",ordinal) values (${m.id},'כן',0),(${m.id},'לא',1)`;
  console.log("QA_CLOSE_MARKET_ID=" + m.id);
  await sharedSql.end();
  process.exit(0);
}
main().catch((e) => { console.error("QA_FAIL", e); process.exit(1); });
