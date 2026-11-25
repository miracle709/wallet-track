import { config } from "./config.js";
import type { PnlWindow, UserPnlPoint, UserPnlSeries } from "./types.js";

const DAY_SECONDS = 86400;

/** The series' per-point "economic" cumulative pnl: realized + unrealized (falls back to realized_pnl). */
function cumulativePnl(point: UserPnlPoint): number {
  const unrealized = point.unrealized_pnl ?? 0;
  return point.realized_pnl + unrealized;
}

/** Finds the series point at or immediately before `targetTs` (series is oldest-first). */
function pointAtOrBefore(points: UserPnlPoint[], targetTs: number): UserPnlPoint | null {
  let candidate: UserPnlPoint | null = null;
  for (const p of points) {
    if (p.timestamp <= targetTs) candidate = p;
    else break;
  }
  return candidate;
}

export function computePnlWindow(series: UserPnlSeries | null): { pnl: PnlWindow; volumeUsdc: number } {
  const zero: PnlWindow = { daily: 0, sevenDay: 0, thirtyDay: 0, total: 0 };
  if (!series || series.points.length === 0) return { pnl: zero, volumeUsdc: 0 };

  const points = series.points;
  const latest = points[points.length - 1];
  const now = latest.timestamp;

  const dayAgo = pointAtOrBefore(points, now - DAY_SECONDS);
  const sevenAgo = pointAtOrBefore(points, now - 7 * DAY_SECONDS);
  const thirtyAgo = pointAtOrBefore(points, now - 30 * DAY_SECONDS);
  const first = points[0];

  const latestCum = cumulativePnl(latest);

  return {
    pnl: {
      daily: latestCum - (dayAgo ? cumulativePnl(dayAgo) : cumulativePnl(first)),
      sevenDay: latestCum - (sevenAgo ? cumulativePnl(sevenAgo) : cumulativePnl(first)),
      thirtyDay: latestCum - (thirtyAgo ? cumulativePnl(thirtyAgo) : cumulativePnl(first)),
      total: latestCum,
    },
    volumeUsdc: latest.volume_usdc,
  };
}

export function passesGreenGate(pnl: PnlWindow): boolean {
  return (
    pnl.sevenDay > config.minSevenDayPnlUsdc &&
    pnl.thirtyDay > config.minThirtyDayPnlUsdc &&
    pnl.total > config.minTotalPnlUsdc
  );
}
