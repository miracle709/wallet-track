import express from "express";
import type { Response } from "express";
import cron from "node-cron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, FIELDS } from "./config.js";
import { runPipeline, type ProgressInfo } from "./pipeline.js";
import { scoreWallet } from "./scoreWallet.js";
import { MarketCategoryCache } from "./walletDetail.js";
import * as db from "./db.js";
import type { WalletScore } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

let refreshing = false;
let lastError: string | null = null;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const onDemandCache = new Map<string, { score: WalletScore; fetchedAt: number }>();
const ON_DEMAND_TTL_MS = 5 * 60 * 1000;
const onDemandCategoryCache = new MarketCategoryCache();

// --- Server-Sent Events: pushes live progress to the dashboard while a refresh is running ---
const sseClients = new Set<Response>();

function broadcast(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) client.write(payload);
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  broadcast("refresh-start", {});
  try {
    await runPipeline({
      log: (msg) => console.log(`[refresh] ${msg}`),
      onProgress: (info: ProgressInfo) => broadcast("progress", info),
    });
    lastError = null;
    broadcast("refresh-done", {});
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    console.error("[refresh] failed:", err);
    broadcast("refresh-error", { error: lastError });
  } finally {
    refreshing = false;
  }
}

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write(": connected\n\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

app.get("/api/wallets", (req, res) => {
  const fieldParam = typeof req.query.field === "string" ? req.query.field : undefined;
  const field = fieldParam && fieldParam !== "all" && (FIELDS as string[]).includes(fieldParam) ? fieldParam : undefined;
  const onlyGreen = req.query.onlyGreen === "true";
  const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  const limit = Math.min(Math.max(Number(req.query.limit ?? config.defaultPageSize), 1), 1000);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);

  const { rows, total } = db.queryWallets({ field, onlyGreen, q, limit, offset });
  const run = db.getLatestRun();

  res.json({
    total,
    limit,
    offset,
    fields: FIELDS,
    run,
    wallets: rows,
  });
});

/**
 * On-demand lookup for any wallet address, even one the bulk leaderboard scan hasn't reached yet.
 * Scores it live using the same logic as the bulk pipeline, persists it into the same SQLite table
 * (so it shows up in future list queries too), and caches the result briefly.
 */
app.get("/api/wallet/:address", async (req, res) => {
  const address = req.params.address;
  if (!ADDRESS_RE.test(address)) {
    res.status(400).json({ error: "Not a valid wallet address." });
    return;
  }

  const cached = onDemandCache.get(address.toLowerCase());
  if (cached && Date.now() - cached.fetchedAt < ON_DEMAND_TTL_MS) {
    res.json({ wallet: cached.score, cached: true });
    return;
  }

  try {
    const known = db.getWalletByAddress(address);
    const score = await scoreWallet(
      address,
      { userName: known?.userName, profileImage: known?.profileImage, verified: known?.verified },
      onDemandCategoryCache
    );
    db.upsertWallet(score, "on-demand");
    onDemandCache.set(address.toLowerCase(), { score, fetchedAt: Date.now() });
    res.json({ wallet: score, cached: false });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Failed to score wallet." });
  }
});

app.get("/api/status", (_req, res) => {
  res.json({
    refreshing,
    lastError,
    refreshCron: config.refreshCron,
    run: db.getLatestRun(),
    totalWalletsStored: db.countAllWallets(),
  });
});

app.post("/api/refresh", (_req, res) => {
  if (refreshing) {
    res.status(202).json({ message: "Refresh already running." });
    return;
  }
  void refresh();
  res.status(202).json({ message: "Refresh started." });
});

app.listen(config.port, () => {
  console.log(`wallet-track dashboard: http://localhost:${config.port}`);
  console.log(`Refresh schedule: ${config.refreshCron}`);
});

cron.schedule(config.refreshCron, () => {
  void refresh();
});

// Kick off an initial refresh on boot if the database is empty.
if (db.countAllWallets() === 0) void refresh();
