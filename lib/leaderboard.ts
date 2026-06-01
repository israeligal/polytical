export interface LeaderboardEntry {
  rank: number;
  handle: string;
  netWorth: number;
  accuracy: number; // 0–100
}

export const leaderboard: LeaderboardEntry[] = [
  { rank: 1, handle: "knesset_nerd", netWorth: 48230, accuracy: 81 },
  { rank: 2, handle: "polldancer", netWorth: 41980, accuracy: 78 },
  { rank: 3, handle: "biko2026", netWorth: 39110, accuracy: 74 },
  { rank: 4, handle: "tikva", netWorth: 35400, accuracy: 77 },
  { rank: 5, handle: "mandate_maven", netWorth: 33270, accuracy: 72 },
];
