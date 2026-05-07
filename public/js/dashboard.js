// Dashboard logic: fetches fault registry, zone access data, and analytics.
// INT-01: Polls every 5 seconds so fixes made in the AR scanner appear in real-time.
// CYB-03: Fetches /api/zones - restricted zone details visible only to authorised roles.
// SWE-04: Fault table shows note count per fault.

let statusChart   = null;
let priorityChart = null;

if (Auth.requireAuth()) {
  loadDashboard();
  loadZones();
  loadAnalytics();
  setInterval(loadDashboard,   5000);
  setInterval(loadAnalytics,  10000);

  const resetBtn = document.getElementById("reset-faults-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      resetBtn.disabled = true;
      resetBtn.textContent = "Resetting...";
      try {
        const res = await Auth.fetch("/api/faults/reset", { method: "POST" });
        if (!res.ok) throw new Error("Reset failed");
        await loadDashboard();
        await loadAnalytics();
      } catch (err) {
        alert("Reset failed: " + err.message);
      } finally {
        resetBtn.disabled = false;
        resetBtn.innerHTML = "&#8635; Reset Faults";
      }
    });
  }
}

// ─── Fault table ─────────────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const res = await Auth.fetch("/api/faults");
    if (!res.ok) throw new Error("Failed to load faults (" + res.status + ")");
    const data = await res.json();
    renderFaults(data.faults || []);
    const ts = document.getElementById("last-updated");
    if (ts) ts.textContent = new Date().toLocaleTimeString();
  } catch (err) {
    document.getElementById("faults-body").innerHTML =
      `<tr><td colspan="7" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderFaults(faults) {
  const total    = faults.length;
  const open     = faults.filter((f) => f.status === "OPEN").length;
  const progress = faults.filter((f) => f.status === "IN PROGRESS").length;
  const critical = faults.filter((f) => f.priority === "CRITICAL").length;
  const fixed    = faults.filter((f) => f.status === "FIXED").length;

  document.getElementById("m-total").textContent    = total;
  document.getElementById("m-open").textContent     = open;
  document.getElementById("m-progress").textContent = progress;
  document.getElementById("m-critical").textContent = critical;
  document.getElementById("m-fixed").textContent    = fixed;

  const body = document.getElementById("faults-body");
  if (!faults.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">No faults recorded.</td></tr>';
    return;
  }

  body.innerHTML = faults.map((f) => {
    const pc       = f.priority.toLowerCase();
    const sc       = f.status.toLowerCase().replace(/\s+/g, "-");
    const rowClass = f.status === "FIXED" ? " class=\"row-fixed\"" : "";
    const notes    = f.notes ? f.notes.length : 0;
    const notesTag = notes > 0
      ? `<span class="notes-badge" title="${notes} annotation${notes > 1 ? "s" : ""}">&#9998;&nbsp;${notes}</span>`
      : "";
    return `<tr${rowClass}>
      <td>${escapeHtml(f.id)}</td>
      <td>${escapeHtml(f.title)}${notesTag}</td>
      <td>${escapeHtml(f.zone)}</td>
      <td>${escapeHtml(f.distance)} ${escapeHtml(f.direction)}</td>
      <td><span class="badge ${pc}">${escapeHtml(f.priority)}</span></td>
      <td><span class="badge ${sc}">${escapeHtml(f.status)}</span></td>
      <td>${formatDate(f.reportedAt)}</td>
    </tr>`;
  }).join("");
}

// ─── CYB-03: Zone access panel ───────────────────────────────────────────────

async function loadZones() {
  const body       = document.getElementById("zone-panel-body");
  const badgeEl    = document.getElementById("zone-clearance-badge");
  const lockIconEl = document.getElementById("zone-lock-icon");

  try {
    const res = await Auth.fetch("/api/zones");
    if (!res.ok) throw new Error("Zone data unavailable (" + res.status + ")");
    const { zones, role } = await res.json();

    const hasRestricted = zones.some((z) => z.accessLevel === "restricted" && z.authorized);
    if (hasRestricted) {
      badgeEl.textContent    = "FULL CLEARANCE: " + (role || "").toUpperCase();
      badgeEl.className      = "zone-clearance-badge badge-cleared";
      lockIconEl.textContent = "🔓"; // 🔓
    } else {
      badgeEl.textContent = "STANDARD CLEARANCE: " + (role || "").toUpperCase();
      badgeEl.className   = "zone-clearance-badge badge-standard";
    }

    body.innerHTML = zones.map((z) => renderZoneCard(z)).join("");
  } catch (err) {
    body.innerHTML      = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    badgeEl.textContent = "UNAVAILABLE";
  }
}

function renderZoneCard(zone) {
  const tag = zone.accessLevel === "restricted"
    ? `<span class="zone-tag zone-restricted">RESTRICTED</span>`
    : `<span class="zone-tag zone-standard">STANDARD</span>`;

  if (!zone.authorized) {
    return `<div class="zone-card zone-card-locked">
      <div class="zone-card-header">
        <span class="zone-name">${escapeHtml(zone.name)}</span>${tag}
      </div>
      <div class="zone-card-body">
        <div class="zone-denied">&#128274;&nbsp;${escapeHtml(zone.description)}</div>
        <div class="zone-hint">Senior Engineer or Security Admin clearance required.</div>
      </div>
    </div>`;
  }

  return `<div class="zone-card zone-card-open">
    <div class="zone-card-header">
      <span class="zone-name">${escapeHtml(zone.name)}</span>${tag}
    </div>
    <div class="zone-card-body">
      <div class="zone-desc">${escapeHtml(zone.description)}</div>
      ${zone.hazards
        ? `<div class="zone-hazard">&#9888;&nbsp;${escapeHtml(zone.hazards)}</div>`
        : ""}
      ${zone.operationalDetail
        ? `<div class="zone-ops-detail">${escapeHtml(zone.operationalDetail)}</div>`
        : ""}
    </div>
  </div>`;
}

// ─── Analytics + Charts ──────────────────────────────────────────────────────

const CHART_COLOURS = {
  OPEN:         "#00f0ff",
  "IN PROGRESS":"#f0c000",
  FIXED:        "#5dffb0",
  CRITICAL:     "#ff4d6a",
  HIGH:         "#ff9933",
  MEDIUM:       "#f0c000",
  LOW:          "#5dffb0",
};

async function loadAnalytics() {
  try {
    const res  = await Auth.fetch("/api/analytics");
    if (!res.ok) return;
    const data = await res.json();
    renderStatusChart(data.byStatus);
    renderPriorityChart(data.byPriority);
    renderPredictions(data.predictions || []);
  } catch (_) { /* non-critical — analytics section stays loading */ }
}

function renderStatusChart(byStatus) {
  const ctx    = document.getElementById("chart-status");
  if (!ctx) return;
  const labels = Object.keys(byStatus);
  const values = Object.values(byStatus);
  const colours = labels.map((l) => CHART_COLOURS[l] || "#888");

  if (statusChart) { statusChart.destroy(); }
  statusChart = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: colours, borderWidth: 0 }] },
    options: {
      plugins: { legend: { labels: { color: "#cdeaf0", font: { size: 11 } } } },
      cutout: "65%",
    },
  });
}

function renderPriorityChart(byPriority) {
  const ctx    = document.getElementById("chart-priority");
  if (!ctx) return;
  const labels  = Object.keys(byPriority);
  const values  = Object.values(byPriority);
  const colours = labels.map((l) => CHART_COLOURS[l] || "#888");

  if (priorityChart) { priorityChart.destroy(); }
  priorityChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: colours, borderWidth: 0 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#cdeaf0", font: { size: 10 } }, grid: { color: "rgba(0,240,255,0.08)" } },
        y: { ticks: { color: "#cdeaf0", font: { size: 10 }, stepSize: 1 }, grid: { color: "rgba(0,240,255,0.08)" } },
      },
    },
  });
}

function renderPredictions(predictions) {
  const el = document.getElementById("predictions-body");
  if (!el) return;
  if (!predictions.length) {
    el.innerHTML = '<div class="empty-state">All active faults within target resolution window.</div>';
    return;
  }
  el.innerHTML = predictions.map((p) => {
    const riskClass = p.overdue ? "risk-high" : p.riskScore >= 60 ? "risk-med" : "risk-low";
    const label     = p.overdue
      ? `OVERDUE by ${Math.abs(p.daysLeft).toFixed(1)}d`
      : `${p.daysLeft.toFixed(1)}d remaining`;
    return `<div class="prediction-row">
      <div class="prediction-id">${escapeHtml(p.id)}</div>
      <div class="prediction-title">${escapeHtml(p.title)}</div>
      <div class="prediction-bar-wrap">
        <div class="prediction-bar ${riskClass}" style="width:${Math.min(100, p.riskScore)}%"></div>
      </div>
      <div class="prediction-label ${riskClass}">${label}</div>
    </div>`;
  }).join("");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
