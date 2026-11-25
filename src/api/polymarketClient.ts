import { config } from "../config.js";
import { getJson } from "../http.js";
import type { LeaderboardEntry, Position, UserPnlSeries } from "../types.js";

interface Paginated<T> {
  data: T[];
  pagination: { limit: number; offset: number; has_more: boolean; next_cursor: string | null };
}

const base = config.dataApiBase;

export async function fetchLeaderboard(opts: {
  timePeriod: "day" | "week" | "month" | "all";
  category?: string;
  sortBy?: "PNL" | "VOLUME";
  limit?: number;
  cursor?: string;
}): Promise<Paginated<LeaderboardEntry>> {
  return await getJson<Paginated<LeaderboardEntry>>(`${base}/leaderboard`, {
    time_period: opts.timePeriod,
    category: opts.category,
    sort_by: opts.sortBy ?? "PNL",
    limit: opts.limit ?? config.leaderboardPageSize,
    cursor: opts.cursor,
  });
}

/** Pages through an entire leaderboard slice (time period x category), not just the first page. */
export async function fetchLeaderboardAll(opts: {
  timePeriod: "day" | "week" | "month" | "all";
  category?: string;
  sortBy?: "PNL" | "VOLUME";
}): Promise<LeaderboardEntry[]> {
  const all: LeaderboardEntry[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < config.maxLeaderboardPagesPerSlice; page++) {
    const res = await fetchLeaderboard({ ...opts, limit: config.leaderboardPageSize, cursor }).catch(() => null);
    if (!res || !res.data || res.data.length === 0) break;
    all.push(...res.data);
    if (!res.pagination?.has_more || !res.pagination.next_cursor) break;
    cursor = res.pagination.next_cursor;
  }

  return all;
}

export async function fetchUserPnlSeries(wallet: string): Promise<UserPnlSeries | null> {
  try {
    const res = await getJson<{ data: UserPnlSeries }>(`${base}/user-pnl`, {
      user: wallet,
      interval: "max",
      fidelity: "1d",
    });
    return res.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Pages through a wallet's *entire* closed-position history (up to config.maxPositionsPerWallet,
 * a safety cap, not a sampling limit) so win rate / field classification reflect all-time stats
 * rather than a biased single-page sample.
 */
export async function fetchAllClosedPositions(wallet: string): Promise<Position[]> {
  const all: Position[] = [];
  let cursor: string | undefined;

  try {
    for (let page = 0; all.length < config.maxPositionsPerWallet; page++) {
      const res = await getJson<Paginated<Position>>(`${base}/positions`, {
        user: wallet,
        status: "CLOSED",
        limit: config.positionsPageSize,
        // Neutral, chronological order: CLOSED defaults to sort_by=REALIZED_PNL (biggest wins first),
        // which would bias win rate toward 100% for any wallet whose history exceeds the safety cap.
        sort_by: "TIMESTAMP",
        sort_direction: "DESC",
        cursor,
      });
      if (!res.data || res.data.length === 0) break;
      all.push(...res.data);
      if (!res.pagination?.has_more || !res.pagination.next_cursor) break;
      cursor = res.pagination.next_cursor;
    }
  } catch {
    // Return whatever we managed to collect before the failure.
  }

  return all;
}
