import { config } from "../config.js";
import { getJson } from "../http.js";
import type { GammaMarket } from "../types.js";

const base = config.gammaApiBase;

/** Looks up gamma market metadata (category/tags) for a batch of condition ids. */
export async function fetchMarketsByConditionIds(conditionIds: string[]): Promise<GammaMarket[]> {
  if (conditionIds.length === 0) return [];
  try {
    const url = new URL(`${base}/markets`);
    for (const id of conditionIds) url.searchParams.append("condition_ids", id);
    url.searchParams.set("closed", "any");
    url.searchParams.set("limit", String(conditionIds.length));
    // include_tag is required for gamma to populate the `tags` array on each market.
    url.searchParams.set("include_tag", "true");
    return await getJson<GammaMarket[]>(url.toString());
  } catch {
    return [];
  }
}
