// SWE-03: Tool verification screen.
// Engineers confirm 3 physical markers are present before a fault can be closed.
// On confirm, fires PATCH /api/faults/:id/status {status:"FIXED"} (INT-01).

if (!Auth.requireAuth()) {
  // requireAuth handles redirect
} else {
  initToolCheck();
}

const REQUIRED_TOOLS = [
  {
    id: "ppe",
    marker: "MARKER A",
    name: "Personal Protective Equipment",
    detail: "Hard hat, insulated gloves, hi-visibility vest confirmed at site",
  },
  {
    id: "diag",
    marker: "MARKER B",
    name: "Diagnostic Instrument",
    detail: "Calibrated multimeter, voltage probe, test leads present and functional",
  },
  {
    id: "doc",
    marker: "MARKER C",
    name: "Service Documentation",
    detail: "Job card, fault report sheet, authorisation code verified",
  },
];

const verified = new Set();

function initToolCheck() {
  const params  = new URLSearchParams(window.location.search);
  const faultId = params.get("fault");
  if (!faultId) { window.location.href = "/scanner.html"; return; }

  Auth.fetch("/api/faults/" + encodeURIComponent(faultId))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Not found"))))
    .then((fault) => renderPage(fault))
    .catch(() => renderPage({ id: faultId, title: "Unknown Fault", zone: "—", status: "OPEN" }));
}

function renderPage(fault) {
  document.getElementById("tc-fault-id").textContent    = fault.id;
  document.getElementById("tc-fault-title").textContent = fault.title;
  document.getElementById("tc-fault-zone").textContent  = fault.zone || "—";

  const container = document.getElementById("tc-tools");
  container.innerHTML = REQUIRED_TOOLS.map((tool, i) => `
    <div class="tc-tool-card" id="card-${tool.id}">
      <div class="tc-tool-num">${String(i + 1).padStart(2, "0")}</div>
      <div class="tc-tool-body">
        <div class="tc-tool-marker">${tool.marker}</div>
        <div class="tc-tool-name">${tool.name}</div>
        <div class="tc-tool-detail">${tool.detail}</div>
      </div>
      <div class="tc-tool-right">
        <div class="tc-tool-status" id="tstatus-${tool.id}">
          <span class="tc-badge tc-pending">REQUIRED</span>
        </div>
        <button class="btn tc-verify-btn" id="tbtn-${tool.id}" onclick="verifyTool('${tool.id}')">
          &#9655;&nbsp; Verify Present
        </button>
      </div>
    </div>
  `).join("");

  document.getElementById("tc-confirm-btn")
    .addEventListener("click", () => confirmFix(fault.id));
}

function verifyTool(toolId) {
  verified.add(toolId);
  document.getElementById("card-" + toolId).classList.add("tc-verified");
  document.getElementById("tstatus-" + toolId).innerHTML =
    '<span class="tc-badge tc-ok">&#10003;&nbsp; VERIFIED</span>';
  const btn = document.getElementById("tbtn-" + toolId);
  btn.disabled    = true;
  btn.textContent = "CONFIRMED";
  updateProgress();
}

function updateProgress() {
  const n = verified.size;
  document.getElementById("tc-count").textContent          = n;
  document.getElementById("tc-progress-fill").style.width  = `${(n / 3) * 100}%`;
  document.getElementById("tc-confirm-btn").disabled        = n < 3;
}

async function confirmFix(faultId) {
  const btn = document.getElementById("tc-confirm-btn");
  btn.disabled    = true;
  btn.textContent = "Submitting...";

  try {
    const res = await Auth.fetch(
      `/api/faults/${encodeURIComponent(faultId)}/status`,
      { method: "PATCH", body: JSON.stringify({ status: "FIXED" }) },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server error ${res.status}`);
    }
    const updated = await res.json();
    document.getElementById("tc-success-fault").textContent = `${updated.id} // ${updated.title}`;
    document.getElementById("tc-success").classList.add("tc-success-visible");
    setTimeout(() => { window.location.href = "/dashboard.html"; }, 2800);
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = "Retry — " + (err.message || "Unknown error");
    setTimeout(() => { btn.textContent = "&#9655;  Confirm Fix & Close Task"; }, 3500);
  }
}
