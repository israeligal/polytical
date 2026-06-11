// The official-source attribution line — one component so a licensing or
// phrasing change can't leave stale copies across the public pages.
export function KnessetSourceFooter({ source = "אתר הכנסת" }: { source?: string }) {
  return <p className="mt-8 text-xs text-muted-foreground">נתונים ממקור רשמי · {source}</p>;
}
