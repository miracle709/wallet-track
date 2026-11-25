import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config, type Field } from "./config.js";
import type { RunInfo, RunStatus, WalletScore } from "./types.js";

mkdirSync(dirname(config.dbFile), { recursive: true });

const db = new DatabaseSync(config.dbFile);
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    wallet TEXT PRIMARY KEY,
    user_name TEXT,
    profile_image TEXT,
    verified INTEGER NOT NULL,
    pnl_daily REAL NOT NULL,
    pnl_7d REAL NOT NULL,
    pnl_30d REAL NOT NULL,
    pnl_total REAL NOT NULL,
    all_green INTEGER NOT NULL,
    win_rate REAL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    closed_sample_size INTEGER NOT NULL,
    volume_usdc REAL NOT NULL,
    pnl_to_volume REAL,
    primary_field TEXT NOT NULL,
    field_breakdown TEXT NOT NULL,
    last_updated INTEGER NOT NULL,
    run_id TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_wallets_primary_field ON wallets(primary_field);
  CREATE INDEX IF NOT EXISTS idx_wallets_rank
    ON wallets(all_green DESC, pnl_total DESC, win_rate DESC, pnl_to_volume DESC);

  CREATE TABLE IF NOT EXISTS refresh_runs (
    run_id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    status TEXT NOT NULL,
    total_candidates INTEGER NOT NULL DEFAULT 0,
    scored_count INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );
`);

const upsertWalletStmt = db.prepare(`
  INSERT INTO wallets (
    wallet, user_name, profile_image, verified,
    pnl_daily, pnl_7d, pnl_30d, pnl_total, all_green,
    win_rate, wins, losses, closed_sample_size,
    volume_usdc, pnl_to_volume, primary_field, field_breakdown,
    last_updated, run_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(wallet) DO UPDATE SET
    user_name = excluded.user_name,
    profile_image = excluded.profile_image,
    verified = excluded.verified,
    pnl_daily = excluded.pnl_daily,
    pnl_7d = excluded.pnl_7d,
    pnl_30d = excluded.pnl_30d,
    pnl_total = excluded.pnl_total,
    all_green = excluded.all_green,
    win_rate = excluded.win_rate,
    wins = excluded.wins,
    losses = excluded.losses,
    closed_sample_size = excluded.closed_sample_size,
    volume_usdc = excluded.volume_usdc,
    pnl_to_volume = excluded.pnl_to_volume,
    primary_field = excluded.primary_field,
    field_breakdown = excluded.field_breakdown,
    last_updated = excluded.last_updated,
    run_id = excluded.run_id
`);

export function upsertWallet(score: WalletScore, runId: string): void {
  upsertWalletStmt.run(
    score.wallet,
    score.userName,
    score.profileImage,
    score.verified ? 1 : 0,
    score.pnl.daily,
    score.pnl.sevenDay,
    score.pnl.thirtyDay,
    score.pnl.total,
    score.allGreen ? 1 : 0,
    score.winRate,
    score.wins,
    score.losses,
    score.closedSampleSize,
    score.volumeUsdc,
    score.pnlToVolume,
    score.primaryField,
    JSON.stringify(score.fieldBreakdown),
    score.lastUpdated,
    runId
  );
}

interface WalletRow {
  wallet: string;
  user_name: string;
  profile_image: string;
  verified: number;
  pnl_daily: number;
  pnl_7d: number;
  pnl_30d: number;
  pnl_total: number;
  all_green: number;
  win_rate: number | null;
  wins: number;
  losses: number;
  closed_sample_size: number;
  volume_usdc: number;
  pnl_to_volume: number | null;
  primary_field: Field;
  field_breakdown: string;
  last_updated: number;
}

function rowToWalletScore(row: WalletRow): WalletScore {
  return {
    wallet: row.wallet,
    userName: row.user_name,
    profileImage: row.profile_image,
    verified: !!row.verified,
    pnl: { daily: row.pnl_daily, sevenDay: row.pnl_7d, thirtyDay: row.pnl_30d, total: row.pnl_total },
    allGreen: !!row.all_green,
    winRate: row.win_rate,
    wins: row.wins,
    losses: row.losses,
    closedSampleSize: row.closed_sample_size,
    volumeUsdc: row.volume_usdc,
    pnlToVolume: row.pnl_to_volume,
    primaryField: row.primary_field,
    fieldBreakdown: JSON.parse(row.field_breakdown),
    lastUpdated: row.last_updated,
  };
}

export interface QueryWalletsOptions {
  field?: string;
  onlyGreen?: boolean;
  q?: string;
  limit: number;
  offset: number;
}

export function queryWallets(opts: QueryWalletsOptions): { rows: WalletScore[]; total: number } {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (opts.field) {
    where.push("primary_field = ?");
    params.push(opts.field);
  }
  if (opts.onlyGreen) {
    where.push("all_green = 1");
  }
  if (opts.q) {
    where.push("(LOWER(wallet) LIKE ? OR LOWER(user_name) LIKE ?)");
    const pattern = `%${opts.q.toLowerCase()}%`;
    params.push(pattern, pattern);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM wallets ${whereSql}`)
    .get(...params) as { n: number };

  const rows = db
    .prepare(
      `SELECT * FROM wallets ${whereSql}
       ORDER BY all_green DESC, pnl_total DESC, win_rate DESC, pnl_to_volume DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, opts.limit, opts.offset) as unknown as WalletRow[];

  return { rows: rows.map(rowToWalletScore), total: total.n };
}

export function getWalletByAddress(address: string): WalletScore | null {
  const row = db
    .prepare("SELECT * FROM wallets WHERE LOWER(wallet) = LOWER(?)")
    .get(address) as WalletRow | undefined;
  return row ? rowToWalletScore(row) : null;
}

export function countAllWallets(): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM wallets").get() as { n: number };
  return row.n;
}

// --- Refresh run tracking (powers the live progress bar) ---

const createRunStmt = db.prepare(
  `INSERT INTO refresh_runs (run_id, started_at, status, total_candidates, scored_count)
   VALUES (?, ?, 'discovering', 0, 0)`
);

export function createRun(runId: string): void {
  createRunStmt.run(runId, Date.now());
}

export function setRunDiscovered(runId: string, totalCandidates: number): void {
  db.prepare("UPDATE refresh_runs SET status = 'scoring', total_candidates = ? WHERE run_id = ?").run(
    totalCandidates,
    runId
  );
}

const incrementScoredStmt = db.prepare(
  "UPDATE refresh_runs SET scored_count = scored_count + 1 WHERE run_id = ?"
);

export function incrementScored(runId: string): void {
  incrementScoredStmt.run(runId);
}

export function finishRun(runId: string, status: Extract<RunStatus, "done" | "error">, error?: string): void {
  db.prepare("UPDATE refresh_runs SET status = ?, finished_at = ?, error = ? WHERE run_id = ?").run(
    status,
    Date.now(),
    error ?? null,
    runId
  );
}

interface RunRow {
  run_id: string;
  started_at: number;
  finished_at: number | null;
  status: RunStatus;
  total_candidates: number;
  scored_count: number;
  error: string | null;
}

function rowToRunInfo(row: RunRow): RunInfo {
  return {
    runId: row.run_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    totalCandidates: row.total_candidates,
    scoredCount: row.scored_count,
    error: row.error,
  };
}

export function getLatestRun(): RunInfo | null {
  const row = db.prepare("SELECT * FROM refresh_runs ORDER BY started_at DESC LIMIT 1").get() as
    | RunRow
    | undefined;
  return row ? rowToRunInfo(row) : null;
}

export function getRun(runId: string): RunInfo | null {
  const row = db.prepare("SELECT * FROM refresh_runs WHERE run_id = ?").get(runId) as RunRow | undefined;
  return row ? rowToRunInfo(row) : null;
}
