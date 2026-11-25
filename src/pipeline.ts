import pLimit from "p-limit";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { discoverCandidateWallets } from "./discover.js";
import { scoreWallet } from "./scoreWallet.js";
import { MarketCategoryCache } from "./walletDetail.js";
import * as db from "./db.js";

export interface ProgressInfo {
  runId: string;
  scored: number;
  total: number;
}

export interface PipelineCallbacks {
  log?: (msg: string) => void;
  onProgress?: (info: ProgressInfo) => void;
}

/**
 * Discovers candidate wallets, then scores them concurrently - writing each wallet's result to
 * SQLite (via db.upsertWallet) the moment it's computed, rather than batching everything in memory
 * until the whole run finishes. This lets the dashboard show results while the scan is still going.
 */
export async function runPipeline(cb: PipelineCallbacks = {}): Promise<{ runId: string }> {
  const log = cb.log ?? (() => {});
  const runId = randomUUID();
  db.createRun(runId);

  try {
    log("Discovering candidate wallets from leaderboards...");
    const candidates = await discoverCandidateWallets(log);
    log(`Found ${candidates.size} candidate wallets.`);
    db.setRunDiscovered(runId, candidates.size);
    cb.onProgress?.({ runId, scored: 0, total: candidates.size });

    const limit = pLimit(config.dataApiConcurrency);
    const categoryCache = new MarketCategoryCache();

    let scored = 0;
    await Promise.all(
      [...candidates.values()].map((entry) =>
        limit(async () => {
          const score = await scoreWallet(
            entry.user_id,
            { userName: entry.user_name, profileImage: entry.profile_image, verified: entry.verified },
            categoryCache
          );

          db.upsertWallet(score, runId);
          db.incrementScored(runId);
          scored++;

          if (scored % config.progressBroadcastEvery === 0 || scored === candidates.size) {
            cb.onProgress?.({ runId, scored, total: candidates.size });
          }
          if (scored % 100 === 0) log(`Scored ${scored}/${candidates.size} wallets...`);
        })
      )
    );

    db.finishRun(runId, "done");
    cb.onProgress?.({ runId, scored, total: candidates.size });
    log(`Pipeline complete (run ${runId}).`);
    return { runId };
  } catch (err) {
    db.finishRun(runId, "error", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
