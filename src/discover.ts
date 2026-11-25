import pLimit from "p-limit";
import { config } from "./config.js";
import { fetchLeaderboardAll } from "./api/polymarketClient.js";
import type { LeaderboardEntry } from "./types.js";

/**
 * Pulls the *entire* Polymarket leaderboard (paged to completion) across several time windows
 * and categories and merges the results into a deduplicated pool of candidate wallets.
 */
export async function discoverCandidateWallets(
  log: (msg: string) => void = () => {}
): Promise<Map<string, LeaderboardEntry>> {
  const limit = pLimit(config.dataApiConcurrency);
  const wallets = new Map<string, LeaderboardEntry>();

  const jobs: Array<Promise<void>> = [];
  for (const timePeriod of config.leaderboardTimePeriods) {
    for (const category of config.leaderboardCategories) {
      jobs.push(
        limit(async () => {
          const entries = await fetchLeaderboardAll({ timePeriod, category, sortBy: "PNL" }).catch(() => []);
          log(`  ${timePeriod}/${category}: ${entries.length} wallets`);
          for (const entry of entries) {
            const existing = wallets.get(entry.user_id);
            if (!existing || entry.pnl > existing.pnl) {
              wallets.set(entry.user_id, entry);
            }
          }
        })
      );
    }
  }

  await Promise.all(jobs);

  if (config.maxCandidates > 0 && wallets.size > config.maxCandidates) {
    const trimmed = [...wallets.values()]
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, config.maxCandidates);
    return new Map(trimmed.map((w) => [w.user_id, w]));
  }

  return wallets;
}
