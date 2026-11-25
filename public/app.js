const PAGE_SIZE = 200;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const state = {
  field: "all",
  onlyGreen: true,
  q: "",
  loadedCount: 0, // how many rows are currently shown for the active filters
  total: 0,
  onDemandMode: false,
  awaitingManualRefresh: false, // true only after the user clicks "Refresh now"
};

const walletBody = document.getElementById("walletBody");
const generatedAtEl = document.getElementById("generatedAt");
const countLabel = document.getElementById("countLabel");
const refreshBtn = document.getElementById("refreshBtn");
const onlyGreenToggle = document.getElementById("onlyGreen");
const fieldTabs = document.getElementById("fieldTabs");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const searchNote = document.getElementById("searchNote");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const progressWrap = document.getElementById("progressWrap");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");

function fmtUsd(n) {
  if (n === null || n === undefined) return "-";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtPct(n) {
  if (n === null || n === undefined) return "-";
  return `${(n * 100).toFixed(1)}%`;
}

function pnlClass(n) {
  return n > 0 ? "positive" : n < 0 ? "negative" : "";
}

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function setSearchNote(text) {
  searchNote.hidden = !text;
  searchNote.textContent = text ?? "";
}

function updateProgress(run) {
  if (!run || run.status === "done" || run.status === "error") {
    progressWrap.hidden = true;
    return;
  }
  const total = run.totalCandidates || 0;
  const scored = run.scoredCount || 0;
  const pct = total > 0 ? Math.min(100, Math.round((scored / total) * 100)) : 0;
  progressWrap.hidden = false;
  progressFill.style.width = `${pct}%`;
  progressLabel.textContent =
    run.status === "discovering"
      ? "Discovering candidate wallets..."
      : `Scoring wallets live: ${scored.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`;
}

function rowHtml(w, index) {
  const explorerUrl = `https://future.news/address/${w.wallet}`;
  return `
    <tr>
      <td>${index + 1}</td>
      <td>
        <div class="wallet-cell">
          <div>
            <div class="wallet-addr"><a href="${explorerUrl}" target="_blank" rel="noopener" style="color:inherit">${shortAddr(w.wallet)}</a></div>
            <div class="wallet-name">${w.userName || ""}${w.verified ? " ✓" : ""}</div>
          </div>
        </div>
      </td>
      <td><span class="field-pill">${w.primaryField}</span></td>
      <td class="num pnl ${pnlClass(w.pnl.daily)}">${fmtUsd(w.pnl.daily)}</td>
      <td class="num pnl ${pnlClass(w.pnl.sevenDay)}">${fmtUsd(w.pnl.sevenDay)}</td>
      <td class="num pnl ${pnlClass(w.pnl.thirtyDay)}">${fmtUsd(w.pnl.thirtyDay)}</td>
      <td class="num pnl ${pnlClass(w.pnl.total)}">${fmtUsd(w.pnl.total)}</td>
      <td class="num">${w.winRate === null ? "n/a" : fmtPct(w.winRate)}</td>
      <td class="num">${fmtUsd(w.volumeUsdc)}</td>
      <td class="num">${w.pnlToVolume === null ? "-" : fmtPct(w.pnlToVolume)}</td>
    </tr>
  `;
}

function renderRows(wallets) {
  if (wallets.length === 0) {
    walletBody.innerHTML = `<tr><td colspan="10" class="empty">No wallets match these filters yet.</td></tr>`;
    return;
  }
  walletBody.innerHTML = wallets.map((w, i) => rowHtml(w, i)).join("");
}

/**
 * Loads a batch of wallets. `append: false` (re)loads the current window from the top (used on
 * filter changes and on every live-progress tick, so the ranking stays fresh as scoring continues).
 * `append: true` loads the next batch on top of what's already shown ("Load more").
 */
async function loadWallets({ append = false } = {}) {
  state.onDemandMode = false;
  const limit = append ? PAGE_SIZE : Math.max(state.loadedCount, PAGE_SIZE);
  const offset = append ? state.loadedCount : 0;

  const params = new URLSearchParams();
  if (state.field !== "all") params.set("field", state.field);
  if (state.onlyGreen) params.set("onlyGreen", "true");
  if (state.q) params.set("q", state.q);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  if (!append) walletBody.innerHTML = `<tr><td colspan="10" class="empty">Loading wallets...</td></tr>`;
  setSearchNote("");

  try {
    const res = await fetch(`/api/wallets?${params.toString()}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      walletBody.innerHTML = `<tr><td colspan="10" class="empty">${body.error ?? "Failed to load wallets."}</td></tr>`;
      return;
    }
    const data = await res.json();

    // A specific address was searched but isn't in the scanned pool yet - score it live instead.
    if (data.total === 0 && ADDRESS_RE.test(state.q)) {
      await searchOnDemand(state.q);
      return;
    }

    state.total = data.total;
    if (append) {
      const existingRows = [...walletBody.querySelectorAll("tr")].length;
      walletBody.insertAdjacentHTML("beforeend", data.wallets.map((w, i) => rowHtml(w, existingRows + i)).join(""));
      state.loadedCount += data.wallets.length;
    } else {
      renderRows(data.wallets);
      state.loadedCount = data.wallets.length;
    }

    generatedAtEl.textContent = data.run?.finishedAt
      ? `Last full refresh: ${new Date(data.run.finishedAt).toLocaleString()}`
      : data.run
      ? `Refresh in progress (started ${new Date(data.run.startedAt).toLocaleTimeString()})`
      : "No refresh has run yet";
    countLabel.textContent = `${state.loadedCount.toLocaleString()} of ${state.total.toLocaleString()} wallet${state.total === 1 ? "" : "s"}`;
    loadMoreBtn.hidden = state.loadedCount >= state.total;
    updateProgress(data.run);
  } catch (err) {
    walletBody.innerHTML = `<tr><td colspan="10" class="empty">Error loading wallets: ${err}</td></tr>`;
  }
}

async function searchOnDemand(address) {
  state.onDemandMode = true;
  walletBody.innerHTML = `<tr><td colspan="10" class="empty">Wallet not in the cached list yet - fetching live stats for ${address}...</td></tr>`;
  loadMoreBtn.hidden = true;
  try {
    const res = await fetch(`/api/wallet/${address}`);
    const body = await res.json();
    if (!res.ok) {
      walletBody.innerHTML = `<tr><td colspan="10" class="empty">${body.error ?? "Failed to fetch that wallet."}</td></tr>`;
      return;
    }
    setSearchNote("This wallet wasn't in the pre-scanned pool yet - showing a live, on-demand lookup (now saved for next time).");
    renderRows([body.wallet]);
    countLabel.textContent = "1 wallet (on-demand)";
  } catch (err) {
    walletBody.innerHTML = `<tr><td colspan="10" class="empty">Error fetching wallet: ${err}</td></tr>`;
  }
}

fieldTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  state.field = btn.dataset.field;
  state.loadedCount = 0;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  loadWallets({ append: false });
});

onlyGreenToggle.addEventListener("change", () => {
  state.onlyGreen = onlyGreenToggle.checked;
  state.loadedCount = 0;
  loadWallets({ append: false });
});

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  state.q = searchInput.value.trim();
  state.loadedCount = 0;
  loadWallets({ append: false });
});

loadMoreBtn.addEventListener("click", () => loadWallets({ append: true }));

refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";
  state.awaitingManualRefresh = true;
  try {
    await fetch("/api/refresh", { method: "POST" });
  } finally {
    setTimeout(() => {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh now";
    }, 3000);
  }
});

// --- Live updates: as the background pipeline scores wallets, refresh the current window. ---
function connectLiveUpdates() {
  const source = new EventSource("/api/events");

  source.addEventListener("progress", (e) => {
    const info = JSON.parse(e.data);
    updateProgress({ status: "scoring", totalCandidates: info.total, scoredCount: info.scored });
  });

  source.addEventListener("refresh-start", () => {
    progressWrap.hidden = false;
    progressLabel.textContent = "Starting refresh...";
  });

  source.addEventListener("refresh-done", () => {
    if (state.awaitingManualRefresh) {
      state.awaitingManualRefresh = false;
      if (!state.onDemandMode) loadWallets({ append: false });
    }
  });

  source.addEventListener("refresh-error", (e) => {
    const info = JSON.parse(e.data);
    progressWrap.hidden = true;
    setSearchNote(`Last refresh failed: ${info.error}`);
  });

  source.onerror = () => {
    // EventSource auto-reconnects; nothing to do here.
  };
}

(async function init() {
  try {
    const res = await fetch("/api/status");
    const status = await res.json();
    updateProgress(status.run);
  } catch {
    // ignore - loadWallets below will surface any real error
  }
  await loadWallets({ append: false });
  connectLiveUpdates();
})();
