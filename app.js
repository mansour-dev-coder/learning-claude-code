/* Personal investment holdings tracker
 * Tracks private / pre-IPO / public shares with manual valuations.
 * Data is persisted in localStorage. */

const STORAGE_KEY = "holdings.v1";

/** @type {Array<Object>} */
let holdings = [];

/* ---------- Persistence ---------- */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    holdings = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load holdings:", e);
    holdings = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
}

/* ---------- Formatting helpers ---------- */

const usd = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);

const usdCompact = (n) => {
  // Whole-dollar display for large summary numbers.
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);
};

const pct = (n) => `${n >= 0 ? "+" : ""}${(n || 0).toFixed(2)}%`;

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const gainClass = (n) => (n > 0 ? "gain" : n < 0 ? "loss" : "");

const tagClass = (type) =>
  type === "Private" ? "private" : type === "Pre-IPO" ? "preipo" : "public";

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/* ---------- Calculations ---------- */

function computeMetrics(h) {
  const shares = Number(h.shares) || 0;
  const cost = Number(h.costPerShare) || 0;
  const val = Number(h.valuation) || 0;
  const totalCost = shares * cost;
  const currentValue = shares * val;
  const gain = currentValue - totalCost;
  const gainPct = totalCost > 0 ? (gain / totalCost) * 100 : 0;
  return { totalCost, currentValue, gain, gainPct };
}

/* ---------- Rendering ---------- */

const container = document.getElementById("holdingsContainer");
const emptyState = document.getElementById("emptyState");

function render() {
  // Summary totals
  let portfolioCost = 0;
  let portfolioValue = 0;
  for (const h of holdings) {
    const m = computeMetrics(h);
    portfolioCost += m.totalCost;
    portfolioValue += m.currentValue;
  }
  const portfolioGain = portfolioValue - portfolioCost;
  const portfolioGainPct =
    portfolioCost > 0 ? (portfolioGain / portfolioCost) * 100 : 0;

  document.getElementById("totalCost").textContent = usdCompact(portfolioCost);
  document.getElementById("totalValue").textContent = usdCompact(portfolioValue);

  const gainEl = document.getElementById("totalGain");
  gainEl.textContent = usdCompact(portfolioGain);
  gainEl.className = "summary-value " + gainClass(portfolioGain);

  const gainPctEl = document.getElementById("totalGainPct");
  gainPctEl.textContent = pct(portfolioGainPct);
  gainPctEl.className = "summary-sub " + gainClass(portfolioGain);

  // Holdings list
  container.innerHTML = "";
  emptyState.hidden = holdings.length > 0;

  for (const h of holdings) {
    const m = computeMetrics(h);
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="card-top">
        <div class="card-company">
          <h3>${escapeHtml(h.company)}</h3>
          <span class="tag ${tagClass(h.type)}">${escapeHtml(h.type)}</span>
        </div>
        <div class="card-actions">
          <button class="btn-icon" data-action="edit" data-id="${h.id}">Edit</button>
          <button class="btn-icon danger" data-action="delete" data-id="${h.id}">Delete</button>
        </div>
      </div>
      <div class="card-grid">
        <div class="metric">
          <span class="metric-label">Shares</span>
          <span class="metric-value">${(Number(h.shares) || 0).toLocaleString()}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Cost / share</span>
          <span class="metric-value">${usd(h.costPerShare)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Last valuation / share</span>
          <span class="metric-value">${usd(h.valuation)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Total cost</span>
          <span class="metric-value">${usd(m.totalCost)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Current value</span>
          <span class="metric-value">${usd(m.currentValue)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Gain / loss</span>
          <span class="metric-value ${gainClass(m.gain)}">${usd(m.gain)} <small>(${pct(m.gainPct)})</small></span>
        </div>
      </div>
      <p class="acquired-note">Acquired ${formatDate(h.acquiredDate)}</p>
    `;
    container.appendChild(card);
  }
}

/* ---------- Modal handling ---------- */

const overlay = document.getElementById("modalOverlay");
const form = document.getElementById("holdingForm");
const modalTitle = document.getElementById("modalTitle");

function openModal(holding) {
  form.reset();
  if (holding) {
    modalTitle.textContent = "Edit holding";
    document.getElementById("holdingId").value = holding.id;
    document.getElementById("company").value = holding.company;
    document.getElementById("type").value = holding.type;
    document.getElementById("shares").value = holding.shares;
    document.getElementById("costPerShare").value = holding.costPerShare;
    document.getElementById("acquiredDate").value = holding.acquiredDate || "";
    document.getElementById("valuation").value = holding.valuation;
  } else {
    modalTitle.textContent = "Add holding";
    document.getElementById("holdingId").value = "";
  }
  overlay.hidden = false;
  document.getElementById("company").focus();
}

function closeModal() {
  overlay.hidden = true;
}

function handleSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("holdingId").value;
  const data = {
    company: document.getElementById("company").value.trim(),
    type: document.getElementById("type").value,
    shares: parseFloat(document.getElementById("shares").value) || 0,
    costPerShare: parseFloat(document.getElementById("costPerShare").value) || 0,
    acquiredDate: document.getElementById("acquiredDate").value,
    valuation: parseFloat(document.getElementById("valuation").value) || 0,
  };

  if (!data.company) return;

  if (id) {
    const idx = holdings.findIndex((h) => h.id === id);
    if (idx !== -1) holdings[idx] = { ...holdings[idx], ...data };
  } else {
    data.id =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    holdings.push(data);
  }

  save();
  render();
  closeModal();
}

/* ---------- Event wiring ---------- */

document.getElementById("addBtn").addEventListener("click", () => openModal(null));
document.getElementById("cancelBtn").addEventListener("click", closeModal);
form.addEventListener("submit", handleSubmit);

overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !overlay.hidden) closeModal();
});

container.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const holding = holdings.find((h) => h.id === id);
  if (!holding) return;

  if (btn.dataset.action === "edit") {
    openModal(holding);
  } else if (btn.dataset.action === "delete") {
    if (confirm(`Delete ${holding.company}? This can't be undone.`)) {
      holdings = holdings.filter((h) => h.id !== id);
      save();
      render();
    }
  }
});

/* ---------- Init ---------- */

load();
render();
