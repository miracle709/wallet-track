import type { Field } from "./config.js";

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  pnl: number;
  volume: number;
  user_name: string;
  profile_image: string;
  x_username: string;
  verified: boolean;
}

export interface UserPnlPoint {
  timestamp: number;
  source_block: number;
  realized_market_pnl: number;
  realized_lp_pnl: number;
  realized_combo_pnl: number;
  realized_pnl: number;
  volume: number;
  volume_usdc: number;
  trade_count: number;
  position_pnl: number | null;
  wallet_income: number | null;
  unrealized_pnl: number | null;
  economic_pnl?: number | null;
}

export interface UserPnlSeries {
  proxy_wallet: string;
  interval: string;
  fidelity: string;
  source_fidelity: string;
  points: UserPnlPoint[];
}

export interface Position {
  proxy_wallet: string;
  token_id: string;
  condition_id: string;
  status: string;
  title: string;
  slug: string;
  icon: string;
  event_id: string;
  event_slug: string;
  outcome: string;
  current_size: number;
  avg_price: number;
  entry_cost_usdc: number;
  entry_fees_usdc: number;
  total_cost_usdc: number;
  current_price: number;
  current_value: number;
  total_size: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  percent_pnl: number;
  percent_realized_pnl: number;
  redeemable: boolean;
  mergeable: boolean;
  negative_risk: boolean;
  archived: boolean;
  verified: boolean;
  outcome_index: number;
  first_entry_at: number;
  last_event_at: number;
  name: string;
  profile_image: string;
}

export interface GammaCategory {
  id: string;
  label: string;
  parentCategory?: string | null;
  slug?: string | null;
}

export interface GammaTag {
  id: string;
  label: string | null;
  slug: string | null;
}

export interface GammaMarket {
  id: string;
  slug: string;
  question: string;
  conditionId: string;
  category?: string | null;
  categories?: GammaCategory[];
  tags?: GammaTag[];
  events?: Array<{
    id?: string | number;
    category?: string | null;
    categories?: GammaCategory[];
    tags?: GammaTag[];
  }>;
}

export interface FieldBreakdown {
  field: Field;
  volumeUsdc: number;
}

export interface PnlWindow {
  daily: number;
  sevenDay: number;
  thirtyDay: number;
  total: number;
}

export interface WalletScore {
  wallet: string;
  userName: string;
  profileImage: string;
  verified: boolean;

  pnl: PnlWindow;
  allGreen: boolean; // 7d, 30d and total pnl all > configured minimums

  winRate: number | null; // closed trades only, null if sample too small
  wins: number;
  losses: number;
  closedSampleSize: number;

  volumeUsdc: number; // lifetime traded volume (from pnl series)
  pnlToVolume: number | null; // total pnl / lifetime volume

  primaryField: Field;
  fieldBreakdown: FieldBreakdown[];

  lastUpdated: number;
}

export type RunStatus = "discovering" | "scoring" | "done" | "error";

export interface RunInfo {
  runId: string;
  status: RunStatus;
  startedAt: number;
  finishedAt: number | null;
  totalCandidates: number;
  scoredCount: number;
  error: string | null;
}
