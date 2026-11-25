import { config, type Field } from "./config.js";
import { classifyMarket } from "./classify.js";
import { fetchMarketsByConditionIds } from "./api/gammaClient.js";
import type { FieldBreakdown, GammaMarket, Position } from "./types.js";

export interface WinRateResult {
  winRate: number | null;
  wins: number;
  losses: number;
  closedSampleSize: number;
}

export function computeWinRate(positions: Position[]): WinRateResult {
  // Only count positions that actually resolved (non-zero realized pnl distinguishes a settled bet
  // from a closed-but-never-filled row); ties (realized_pnl === 0) are excluded from win/loss counts.
  const resolved = positions.filter((p) => p.realized_pnl !== 0);
  const wins = resolved.filter((p) => p.realized_pnl > 0).length;
  const losses = resolved.filter((p) => p.realized_pnl < 0).length;
  const closedSampleSize = resolved.length;

  if (closedSampleSize < config.minClosedTradesForWinRate) {
    return { winRate: null, wins, losses, closedSampleSize };
  }
  return { winRate: wins / closedSampleSize, wins, losses, closedSampleSize };
}

/** A process-wide cache so markets shared across many wallets are only looked up once per refresh. */
export class MarketCategoryCache {
  private cache = new Map<string, Field>();

  get(conditionId: string): Field | undefined {
    return this.cache.get(conditionId);
  }

  async warm(conditionIds: string[]): Promise<void> {
    const missing = conditionIds.filter((id) => !this.cache.has(id));
    if (missing.length === 0) return;

    for (let i = 0; i < missing.length; i += config.gammaConditionBatchSize) {
      const chunk = missing.slice(i, i + config.gammaConditionBatchSize);
      const markets: GammaMarket[] = await fetchMarketsByConditionIds(chunk);
      for (const market of markets) {
        this.cache.set(market.conditionId, classifyMarket(market));
      }
      // Anything gamma didn't return (delisted/odd ids) is marked "other" so we don't re-query it forever.
      for (const id of chunk) {
        if (!this.cache.has(id)) this.cache.set(id, "other");
      }
    }
  }
}

export function fieldBreakdownFor(positions: Position[], categoryCache: MarketCategoryCache): {
  primaryField: Field;
  breakdown: FieldBreakdown[];
} {
  const volumeByField = new Map<Field, number>();

  for (const p of positions) {
    const field = categoryCache.get(p.condition_id) ?? "other";
    const weight = p.total_cost_usdc || p.current_value || 0;
    volumeByField.set(field, (volumeByField.get(field) ?? 0) + weight);
  }

  const breakdown = [...volumeByField.entries()]
    .map(([field, volumeUsdc]) => ({ field, volumeUsdc }))
    .sort((a, b) => b.volumeUsdc - a.volumeUsdc);

  const primaryField = breakdown[0]?.field ?? "other";
  return { primaryField, breakdown };
}
