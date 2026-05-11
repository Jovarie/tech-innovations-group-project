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
  loadToolSession();
  setInterval(loadDashboard,    5000);
  setInterval(loadAnalytics,   10000);
  setInterval(loadToolSession, 15000);

  const resetBtn = document.getElementById("reset-faults-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      resetBtn.disabled = true;
      resetBtn.textContent = "Resetting...";
      try {
        const res = await Auth.fetch("/api/faults/reset", { method: "POST" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Server error ${res.status}`);
        }
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
      `<tr><td colspan="8" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
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
    body.innerHTML = '<tr><td colspan="8" class="empty-state">No faults recorded.</td></tr>';
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
    
    // Handle fixedAt timestamp
    let fixedAtDisplay = "-";
    if (f.status === "FIXED") {
      if (f.fixedAt) {
        fixedAtDisplay = formatDate(f.fixedAt);
      } else if (f.resolvedAt) {
        fixedAtDisplay = formatDate(f.resolvedAt);
      } else if (f.updatedAt) {
        fixedAtDisplay = formatDate(f.updatedAt);
      } else {
        fixedAtDisplay = "Just now";
      }
    }
    
    return `<tr${rowClass}>
      <td>${escapeHtml(f.id)}</td>
      <td>${escapeHtml(f.title)}${notesTag}</td>
      <td>${escapeHtml(f.zone)}</td>
      <td>${escapeHtml(f.distance)} ${escapeHtml(f.direction)}</td>
      <td><span class="badge ${pc}">${escapeHtml(f.priority)}</span></td>
      <td><span class="badge ${sc}">${escapeHtml(f.status)}</span></td>
      <td>${formatDate(f.reportedAt)}</td>
      <td>${fixedAtDisplay}</td>
    </tr>`;
  }).join("");
}

// ─── Function to mark a fault as FIXED with live timestamp ───────────────────

async function markFaultAsFixed(faultId) {
  try {
    const now = new Date();
    const fixedAt = now.toISOString();
    
    const res = await Auth.fetch(`/api/faults/${faultId}/fix`, {
      method: "PATCH",
      body: JSON.stringify({ 
        status: "FIXED",
        fixedAt: fixedAt,
        fixedBy: Auth.getUser()?.username || "unknown"
      }),
    });
    
    if (res.ok) {
      await loadDashboard();
      await loadAnalytics();
      return true;
    } else {
      console.error("Failed to mark fault as fixed");
      return false;
    }
  } catch (err) {
    console.error("Error marking fault as fixed:", err);
    return false;
  }
}

// ─── Listen for status changes from scanner ─────────────────────────────────

window.addEventListener("storage", (event) => {
  if (event.key === "fault_status_update" || event.key === "fault_fixed") {
    console.log("Fault status changed, refreshing dashboard...");
    loadDashboard();
    loadAnalytics();
  }
});

window.addEventListener("fault-status-changed", () => {
  loadDashboard();
  loadAnalytics();
});

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
      lockIconEl.textContent = "🔓";
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

// ─── Tool session panel - TABLE STYLE (matching fault table) ─────────────────

// ─── Tool session panel - TABLE STYLE (showing ALL 7 tools) ────────────────────

async function loadToolSession() {
  const body = document.getElementById("tool-alert-body");
  const iconEl = document.getElementById("tool-alert-icon");
  
  try {
    // Fetch active session
    const sessionRes = await Auth.fetch("/api/tools/session");
    
    if (!sessionRes.ok) throw new Error("Session unavailable");
    
    const { activeTools = [] } = await sessionRes.json();
    

    const allToolsList = [
      { id: "TOOL-WRENCH-01", name: "Adjustable Wrench", type: "hand", required: true },
      { id: "TOOL-MULTI-02", name: "Multimeter", type: "electronic", required: true },
      { id: "TOOL-TORCH-03", name: "Inspection Torch", type: "light", required: false },
      { id: "TOOL-THERMAL-04", name: "Thermal Camera", type: "electronic", required: true },
      { id: "TOOL-GAUGE-05", name: "Crack Gauge", type: "hand", required: true },
      { id: "TOOL-PROBE-06", name: "Voltage Probe", type: "electronic", required: false },
      { id: "TOOL-TAPE-07", name: "Insulation Tape", type: "hand", required: false },
      
    ];
    
    const now = Date.now();
    let hasAlert = false;
    
    // Create a map of active tools for quick lookup
    const activeMap = new Map();
    for (const t of activeTools) {
      activeMap.set(t.toolId, t);
    }
    
    // Stats
    const checkedOutCount = activeTools.length;
    const availableCount = allToolsList.length - checkedOutCount;
    
    // Table header with stats
    let tableHtml = `
      <div class="tool-session-table-wrap">
        <div class="tool-stats-bar">
          <span>🔧 Total Tools: ${allToolsList.length}</span>
          <span> Checked Out: ${checkedOutCount}</span>
          <span> Available: ${availableCount}</span>
        </div>
        <table class="tool-session-table">
          <thead>
            <tr>
              <th>Tool ID</th>
              <th>Tool Name</th>
              <th>Type</th>
              <th>Associated Fault</th>
              <th>Status</th>
              <th>Checked Out</th>
              <th>Time Out</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    // Loop through ALL 7 tools
    for (const tool of allToolsList) {
      const active = activeMap.get(tool.id);
      const isCheckedOut = !!active;
      
      let statusBadge = '';
      let statusClass = '';
      let elapsed = 0;
      let checkedOutTime = '-';
      let faultBadge = '-';
      let overdue = false;
      let rowClass = '';
      
      if (isCheckedOut) {
        elapsed = Math.round((now - new Date(active.checkedOutAt).getTime()) / 60000);
        overdue = (tool.required && elapsed > 120) || elapsed > 120;
        if (overdue) {
          hasAlert = true;
          rowClass = 'row-overdue';
        }
        
        checkedOutTime = formatDate(active.checkedOutAt);
        
        // Associated fault with clickable link
        faultBadge = active.faultId 
          ? `<span class="fault-link-badge" onclick="window.location.href='/scanner.html?fault=${active.faultId}'" style="cursor:pointer;">🔗 ${escapeHtml(active.faultId)}</span>`
          : '-';
        
        // Status badge for checked out tools
        if (overdue) {
          statusBadge = 'OVERDUE';
          statusClass = 'badge-critical';
        } else if (elapsed > 60) {
          statusBadge = 'LONG OUT';
          statusClass = 'badge-warning';
        } else {
          statusBadge = 'IN USE';
          statusClass = 'badge-active';
        }
      } else {
        // Tool is NOT in use - grey status
        statusBadge = 'NOT IN USE';
        statusClass = 'badge-inactive';
        rowClass = 'row-inactive';
      }
      
      tableHtml += `
        <tr class="${rowClass}">
          <td class="tool-id-cell">${escapeHtml(tool.id)}</td>
          <td class="tool-name-cell">🔧 ${escapeHtml(tool.name)}</td>
          <td class="tool-type-cell">${escapeHtml(tool.type)}</td>
          <td class="tool-fault-cell">${faultBadge}</td>
          <td class="tool-status-cell"><span class="badge ${statusClass}">${statusBadge}</span></td>
          <td class="tool-time-cell">${checkedOutTime}</td>
          <td class="tool-elapsed-cell ${isCheckedOut && overdue ? 'elapsed-overdue' : ''}">${isCheckedOut ? elapsed + ' mins' : '-'}</td>
          <td class="tool-action-cell">
            ${isCheckedOut 
              ? `<button class="btn-checkin" onclick="checkinTool('${escapeHtml(tool.id)}')">Check In</button>`
              : `<button class="btn-checkout" onclick="checkoutTool('${escapeHtml(tool.id)}')">Check Out</button>`
            }
          </td>
        </tr>
      `;
    }
    
    tableHtml += `
          </tbody>
        </table>
      </div>
    `;
    
    body.innerHTML = tableHtml;
    iconEl.textContent = hasAlert ? "⚠️" : "🔧";
    
  } catch (err) {
    body.innerHTML = '<div class="empty-state">Tool session unavailable.</div>';
    iconEl.textContent = "🔧";
  }
}


// Check-out function - redirects to tool tracker camera
// Check-out function - redirects to tool tracker camera
async function checkoutTool(toolId) {
  // Store the tool ID so tool-tracker knows which tool to process
  sessionStorage.setItem("pendingCheckoutTool", toolId);
  // Redirect to tool tracker
  window.location.href = "/tool-tracker.html";
}

// Check-in function - redirects to tool tracker camera
async function checkinTool(toolId) {
  // Store the tool ID so tool-tracker knows which tool to process
  sessionStorage.setItem("pendingCheckinTool", toolId);
  // Redirect to tool tracker
  window.location.href = "/tool-tracker.html";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso) {
  try { 
    const date = new Date(iso);
    return date.toLocaleString(); 
  } catch { 
    return iso; 
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}