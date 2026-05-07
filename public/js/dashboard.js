// Dashboard logic: fetches fault registry and zone access data.
// INT-01: Polls every 5 seconds so fixes made in the AR scanner appear in real-time.
// CYB-03: Fetches /api/zones - restricted zone details visible only to authorised roles.

if (Auth.requireAuth()) {
  loadDashboard();
  loadZones();
  setInterval(loadDashboard, 5000);

  const resetBtn = document.getElementById("reset-faults-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      resetBtn.disabled = true;
      resetBtn.textContent = "Resetting...";
      try {
        const res = await Auth.fetch("/api/faults/reset", { method: "POST" });
        if (!res.ok) throw new Error("Reset failed");
        await loadDashboard();
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
    const pc = f.priority.toLowerCase();
    const sc = f.status.toLowerCase().replace(/\s+/g, "-");
    const rowClass = f.status === "FIXED" ? " class=\"row-fixed\"" : "";
    return `<tr${rowClass}>
      <td>${escapeHtml(f.id)}</td>
      <td>${escapeHtml(f.title)}</td>
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
