export interface LeaderboardEntry {
  rank: number;
  handle: string;
  totalWins: number;     // # correct predictions
  totalResolved: number; // # predictions that resolved
  accuracy: number;      // 0–100
}

export const leaderboard: LeaderboardEntry[] = [
  { rank: 1, handle: "knesset_nerd", totalWins: 81, totalResolved: 100, accuracy: 81 },
  { rank: 2, handle: "polldancer", totalWins: 78, totalResolved: 100, accuracy: 78 },
  { rank: 3, handle: "biko2026", totalWins: 52, totalResolved: 70, accuracy: 74 },
  { rank: 4, handle: "tikva", totalWins: 47, totalResolved: 61, accuracy: 77 },
  { rank: 5, handle: "mandate_maven", totalWins: 36, totalResolved: 50, accuracy: 72 },
];
