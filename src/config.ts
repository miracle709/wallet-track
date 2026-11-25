export const config = {
  dataApiBase: process.env.DATA_API_BASE ?? "https://data-api.polymarket.com/v2",
  gammaApiBase: process.env.GAMMA_API_BASE ?? "https://gamma-api.polymarket.com",

  // Page size used while paging through each leaderboard slice (API max is 1000).
  leaderboardPageSize: Number(process.env.LEADERBOARD_PAGE_SIZE ?? 1000),

  // Safety cap on pages fetched per leaderboard slice (pageSize * this = max wallets per slice).
  // Default 50 * 1000 = 50,000, effectively "all" of them.
  maxLeaderboardPagesPerSlice: Number(process.env.MAX_LEADERBOARD_PAGES ?? 50),

  // Time windows + sort orders used to assemble the candidate wallet pool.
  leaderboardTimePeriods: ["day", "week", "month", "all"] as const,
  leaderboardCategories: ["overall", "sports", "esports"] as const,

  // Optional hard cap on unique candidate wallets evaluated per refresh. Unset (0) = no cap,
  // i.e. every wallet discovered across every leaderboard slice gets scored.
  maxCandidates: Number(process.env.MAX_CANDIDATES ?? 0),

  // Page size + safety cap used while paging through a wallet's full closed-position history
  // (used for win rate and field classification - not a sample, the whole history up to the cap).
  positionsPageSize: Number(process.env.POSITIONS_PAGE_SIZE ?? 1000),
  maxPositionsPerWallet: Number(process.env.MAX_POSITIONS_PER_WALLET ?? 100000),

  // Concurrency caps for outbound requests against each upstream API.
  dataApiConcurrency: Number(process.env.DATA_API_CONCURRENCY ?? 6),
  gammaApiConcurrency: Number(process.env.GAMMA_API_CONCURRENCY ?? 6),

  // How many condition_ids to batch into a single gamma /markets lookup.
  gammaConditionBatchSize: Number(process.env.GAMMA_CONDITION_BATCH_SIZE ?? 20),

  // Hard gates applied before a wallet is considered "copy-worthy".
  minTotalPnlUsdc: Number(process.env.MIN_TOTAL_PNL_USDC ?? 0),
  minSevenDayPnlUsdc: Number(process.env.MIN_7D_PNL_USDC ?? 0),
  minThirtyDayPnlUsdc: Number(process.env.MIN_30D_PNL_USDC ?? 0),
  minClosedTradesForWinRate: Number(process.env.MIN_CLOSED_TRADES ?? 5),

  // Refresh cadence (cron expression). Default: every 30 minutes.
  refreshCron: process.env.REFRESH_CRON ?? "*/30 * * * *",

  port: Number(process.env.PORT ?? 8776),

  dbFile: process.env.DB_FILE ?? "data/wallet-track.db",

  // Default page size for paginated /api/wallets responses (the dashboard's "batch" size).
  defaultPageSize: Number(process.env.DEFAULT_PAGE_SIZE ?? 200),

  // How often (in wallets scored) the pipeline pushes a progress update to connected dashboards.
  progressBroadcastEvery: Number(process.env.PROGRESS_BROADCAST_EVERY ?? 20),

  // Be polite to the public APIs.
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 15000),
  requestRetries: Number(process.env.REQUEST_RETRIES ?? 2),
};

export type Field = "crypto" | "esports" | "sport" | "finance" | "weather" | "other";

export const FIELDS: Field[] = ["crypto", "esports", "sport", "finance", "weather", "other"];

// Keyword rules used to bucket a Polymarket market/event into one of our 5 tracked fields.
// Matched (case-insensitively) against category/subcategory/categories[].label/tags[].label/tags[].slug.
export const FIELD_KEYWORDS: Record<Exclude<Field, "other">, string[]> = {
  crypto: [
    "crypto", "bitcoin", "btc", "ethereum", "eth", "solana", "sol-", "xrp",
    "dogecoin", "doge", "altcoin", "defi", "memecoin", "stablecoin", "blockchain",
    "binance", "coinbase",
  ],
  esports: [
    "esports", "e-sports", "csgo", "cs2", "counter-strike", "valorant", "dota",
    "league of legends", "lol-", "overwatch", "rocket league", "pubg", "fortnite",
    "call of duty", "starcraft", "rainbow six", "smite", "pgl", "blast",
  ],
  sport: [
    "sports", "nba", "nfl", "nhl", "mlb", "soccer", "football", "basketball",
    "baseball", "hockey", "tennis", "golf", "ufc", "mma", "boxing", "cricket",
    "rugby", "f1", "formula 1", "nascar", "olympics", "epl", "premier league",
    "champions league", "world cup", "ncaa", "ncaab", "ncaaf",
  ],
  finance: [
    "finance", "economy", "economics", "fed", "federal reserve", "inflation",
    "interest rate", "cpi", "gdp", "stock", "nasdaq", "s&p", "dow jones",
    "recession", "earnings", "treasury", "market cap", "ipo",
  ],
  weather: [
    "weather", "temperature", "hurricane", "storm", "rainfall", "snow",
    "climate", "heatwave", "tornado", "forecast", "precipitation",
  ],
};
