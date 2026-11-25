# Wallet Track

Finds profitable Polymarket wallets worth copy-trading, ranked by:

1. **PnL** — must be green over 7-day, 30-day, and all-time windows; ranked by total PnL.
2. **Win rate** — share of closed/resolved positions that ended profitable, computed from a
   wallet's *entire* closed-position history (not a sample).
3. **PnL / volume** — capital efficiency (return per dollar traded).

Wallets are also tagged with a primary **field**: `crypto`, `esports`, `sport`, `finance`, `weather`, or `other`,
based on the categories/tags of the markets they trade (via Polymarket's Gamma API).

Click any wallet address in the dashboard to open its full profile on [future.news](https://future.news).

## How it works

- `src/discover.ts` pulls Polymarket's **entire** public leaderboard (`data-api.polymarket.com/v2/leaderboard`),
  paging through every result (not just the first page) across day/week/month/all-time windows and
  overall/sports/esports categories, to build the candidate wallet pool.
- `src/pipeline.ts` / `src/scoreWallet.ts` score each candidate: pulls its cumulative PnL series
  (`/v2/user-pnl`) to compute daily/7d/30d/total PnL and lifetime volume, and pages through its **full**
  closed-position history (`/v2/positions?status=CLOSED`, cursor-paginated to completion) to compute an
  accurate win rate and classify which fields it trades (joined against `gamma-api.polymarket.com/markets`
  tag metadata — note `include_tag=true` is required or Gamma omits the `tags` array entirely).
- **Storage**: every scored wallet is written to a local SQLite database (`src/db.ts`, using Node's
  built-in `node:sqlite` — no native module to install) the instant it's computed, not batched up and
  written once at the end. Ranking (green-PnL-gate first, then total PnL, then win rate, then PnL/volume)
  is done as a SQL `ORDER BY` at query time, so the dashboard is always reading live, current state.
- `src/server.ts` serves wallets as paginated JSON (`/api/wallets?limit=200&offset=0`) and a static
  dashboard, and re-runs the pipeline on a cron schedule (default every 30 minutes).
- **Live progress**: `/api/events` is a Server-Sent-Events stream that pushes a progress update
  (`{ scored, total }`) every ~20 wallets scored. The dashboard shows a live progress bar and
  re-fetches its currently-visible rows on each tick — so you see results appear in batches
  while the rest of the scan keeps running in the background, instead of a blank screen until
  the whole (potentially tens-of-thousands-of-wallets) scan finishes.
- **Pagination / "load more"**: the dashboard loads an initial batch of 200 wallets and a "Load more"
  button fetches the next batch (`offset`-based), so you're never waiting on or rendering the entire table
  at once.
- **Search**: the dashboard's search box filters the pool already in the database by address/name
  (`GET /api/wallets?q=...`). If you search a full `0x...` address that isn't there yet, the server scores
  it live on demand (`GET /api/wallet/:address`, same logic as the bulk pipeline, 5-minute cache), saving it
  into the same database so it shows up in future list queries too.

All data comes from Polymarket's public, unauthenticated APIs — no API key needed.

## Run it

```bash
npm install
npm run dev          # starts the API + dashboard on http://localhost:8776, runs an initial refresh
```

Open http://localhost:8776 to see the dashboard. Results stream in as soon as the first wallets are scored
(no need to wait for the whole scan) — watch the progress bar, and use "Load more" to page through what's
been found so far. Use the field tabs (Crypto / Esports / Sport / Finance / Weather), the "only green PnL"
toggle, and the search box to filter. Click "Refresh now" to force an immediate re-scan.

To just run the scoring pipeline once from the CLI (writes into `data/wallet-track.db`, a SQLite file you
can inspect with any SQLite client, e.g. `sqlite3 data/wallet-track.db`):

```bash
npm run refresh
```

⚠️ **Heads up on runtime**: discovery now pages through the *whole* leaderboard (tens of thousands of
wallets on `all/overall`), and each wallet's full closed-position history is fetched to compute an accurate
win rate. A full refresh can take a long time and makes a large number of requests to Polymarket's public
APIs. Tune the variables below (especially `MAX_CANDIDATES`, `MAX_LEADERBOARD_PAGES`, and the concurrency
caps) if you want a faster, smaller scan instead of a full one.

## Configuration

All tunables are environment variables (see `src/config.ts` for defaults), e.g.:

| Variable | Default | Meaning |
|---|---|---|
| `MAX_CANDIDATES` | 0 (no cap) | If >0, trims the discovered pool to this many wallets (highest PnL first) before scoring |
| `LEADERBOARD_PAGE_SIZE` | 1000 | Page size per leaderboard request (API max) |
| `MAX_LEADERBOARD_PAGES` | 50 | Safety cap on pages fetched per leaderboard slice (50 × 1000 = 50,000 wallets) |
| `POSITIONS_PAGE_SIZE` | 1000 | Page size per closed-positions request (API max) |
| `MAX_POSITIONS_PER_WALLET` | 100000 | Safety cap on closed positions fetched per wallet (not a sample size — raise only if a wallet's full history is being truncated) |
| `MIN_7D_PNL_USDC` / `MIN_30D_PNL_USDC` / `MIN_TOTAL_PNL_USDC` | 0 | Green-gate thresholds |
| `MIN_CLOSED_TRADES` | 5 | Minimum resolved trades before a win rate is shown (otherwise `n/a`) |
| `DATA_API_CONCURRENCY` / `GAMMA_API_CONCURRENCY` | 6 | Concurrent requests against each upstream API |
| `REFRESH_CRON` | `*/30 * * * *` | Cron schedule for automatic re-scans |
| `PORT` | 8776 | Dashboard/API port |
| `DB_FILE` | `data/wallet-track.db` | SQLite database path |
| `DEFAULT_PAGE_SIZE` | 200 | Dashboard's default batch size (`/api/wallets` page size) |
| `PROGRESS_BROADCAST_EVERY` | 20 | How many wallets scored between each live-progress SSE push |

## Notes / caveats

- "Field" classification is keyword/tag-based (see `FIELD_KEYWORDS` in `src/config.ts`) since Polymarket
  does not expose a fixed category enum publicly — tune the keyword lists as new tags appear.
- Closed-position pagination uses `sort_by=TIMESTAMP` (not the API's default `REALIZED_PNL`) specifically so
  that if a wallet's history ever exceeds `MAX_POSITIONS_PER_WALLET`, the truncated sample isn't biased
  toward that wallet's biggest wins.
- This is a read-only research/ranking tool. It does not place trades.
