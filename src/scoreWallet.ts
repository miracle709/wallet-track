import { fetchAllClosedPositions, fetchUserPnlSeries } from "./api/polymarketClient.js";
import { computePnlWindow, passesGreenGate } from "./pnl.js";
import { computeWinRate, fieldBreakdownFor, MarketCategoryCache } from "./walletDetail.js";
import type { WalletScore } from "./types.js";

export interface WalletMeta {
  userName?: string;
  profileImage?: string;
  verified?: boolean;
}

/** Scores a single wallet. Shared by the bulk pipeline and the on-demand search endpoint. */
export async function scoreWallet(
  wallet: string,
  meta: WalletMeta,
  categoryCache: MarketCategoryCache
): Promise<WalletScore> {
  const [series, closedPositions] = await Promise.all([
    fetchUserPnlSeries(wallet),
    fetchAllClosedPositions(wallet),
  ]);

  const { pnl, volumeUsdc } = computePnlWindow(series);
  const winRateResult = computeWinRate(closedPositions);

  const conditionIds = [...new Set(closedPositions.map((p) => p.condition_id))];
  await categoryCache.warm(conditionIds);
  const { primaryField, breakdown } = fieldBreakdownFor(closedPositions, categoryCache);

  const pnlToVolume = volumeUsdc > 0 ? pnl.total / volumeUsdc : null;

  return {
    wallet,
    userName: meta.userName ?? "",
    profileImage: meta.profileImage ?? "",
    verified: meta.verified ?? false,
    pnl,
    allGreen: passesGreenGate(pnl),
    winRate: winRateResult.winRate,
    wins: winRateResult.wins,
    losses: winRateResult.losses,
    closedSampleSize: winRateResult.closedSampleSize,
    volumeUsdc,
    pnlToVolume,
    primaryField,
    fieldBreakdown: breakdown,
    lastUpdated: Date.now(),
  };
}
