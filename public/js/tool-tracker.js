// SWE-03 / Tool Tracker: AR QR scanning for physical tool checkout/checkin.
// Engineers scan tool QR codes to log session-based tool usage against faults.

if (!Auth.requireAuth()) {
  // redirect handled by requireAuth
} else {
  initTracker();
}

const TOOLS = {
  "TOOL-WRENCH-01":  { name: "Adjustable Wrench", type: "hand"       },
  "TOOL-MULTI-02":   { name: "Multimeter",         type: "electronic" },
  "TOOL-TORCH-03":   { name: "Inspection Torch",   type: "light"      },
  "TOOL-THERMAL-04": { name: "Thermal Camera",     type: "electronic" },
  "TOOL-PROBE-06":   { name: "Voltage Probe",      type: "electronic" },
  "TOOL-TAPE-07":    { name: "Insulation Tape",    type: "hand"       },
  "TOOL-GAUGE-05":   { name: "Crack Gauge",        type: "hand"       },
};

const video         = document.getElementById("tool-video");
const gate          = document.getElementById("gate");
const statusEl      = document.getElementById("status-text");
const labelEl       = document.getElementById("tool-label");
const tlTag         = document.getElementById("tl-tag");
const tlName        = document.getElementById("tl-name");
const tlStatus      = document.getElementById("tl-status");
const tlType        = document.getElementById("tl-type");
const tlAction      = document.getElementById("tl-action");
const sessionPanel  = document.getElementById("session-panel");
const sessionList   = document.getElementById("session-list");
const sessionCount  = document.getElementById("session-count");
const historySection = document.getElementById("history-section");
const historyList   = document.getElementById("history-list");

let stream      = null;
let scanning    = false;
let currentTool = null;   // toolId of last detected QR
let sessionData = [];
let historyOpen = false;

function initTracker() {
  document.getElementById("start-btn").addEventListener("click", startCamera);
  window.addEventListener("beforeunload", () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  });
  loadSession();
}

// ─── Session / history ───────────────────────────────────────────────────────

async function loadSession() {
  try {
    const res = await Auth.fetch("/api/tools/session");
    if (!res.ok) return;
    const { activeTools } = await res.json();
    sessionData = activeTools || [];
    renderSession();
  } catch (_) {}
}

function renderSession() {
  sessionCount.textContent = sessionData.length;

  if (!sessionData.length) {
    sessionList.innerHTML =
      '<div class="empty-state" style="padding:14px 12px;">All tools checked in</div>';
    return;
  }

  sessionList.innerHTML = sessionData.map((t) => {
    const info    = TOOLS[t.toolId];
    const name    = info ? info.name : t.toolId;
    const elapsed = Math.round((Date.now() - new Date(t.checkedOutAt).getTime()) / 60000);
    const overdue = info && elapsed > 120;
    return `<div class="tt-tool-row${overdue ? " tt-tool-overdue" : ""}">
      <div class="tt-tool-info">
        <div class="tt-tool-name">&#128295;&nbsp;${escapeHtml(name)}</div>
        <div class="tt-tool-meta">Out ${elapsed}m${t.faultId ? "&nbsp;&#183;&nbsp;" + escapeHtml(t.faultId) : ""}</div>
      </div>
      <button class="btn secondary btn-sm" onclick="checkinTool('${escapeHtml(t.toolId)}')">Check In</button>
    </div>`;
  }).join("");
}

async function loadHistory() {
  try {
    const res = await Auth.fetch("/api/tools/history");
    if (!res.ok) return;
    const { history } = await res.json();
    if (!history.length) {
      historyList.innerHTML = '<div class="empty-state" style="padding:10px 12px;">No activity yet</div>';
      return;
    }
    historyList.innerHTML = history.map((h) => {
      const actionClass = h.action === "CHECKOUT" ? "tt-hist-out" : "tt-hist-in";
      return `<div class="tt-hist-row">
        <span class="tt-hist-action ${actionClass}">${h.action}</span>
        <span class="tt-hist-name">${escapeHtml(h.toolName || h.toolId)}</span>
        <span class="tt-hist-meta">${escapeHtml(h.user)} · ${formatTime(h.timestamp)}${h.faultId ? " · " + escapeHtml(h.faultId) : ""}</span>
      </div>`;
    }).join("");
  } catch (_) {}
}

function toggleSession() {
  sessionPanel.classList.toggle("hidden");
  if (!sessionPanel.classList.contains("hidden")) {
    loadSession();
  }
}

async function toggleHistory() {
  historyOpen = !historyOpen;
  historySection.classList.toggle("hidden", !historyOpen);
  if (historyOpen) await loadHistory();
}

// ─── Camera & QR ─────────────────────────────────────────────────────────────

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
    });
    video.srcObject = stream;
    await video.play();
    gate.classList.add("hidden");
    statusEl.textContent = "SCANNING…";
    scanning = true;
    requestAnimationFrame(tick);
  } catch (_) {
    document.getElementById("gate-error").textContent = "Camera access denied";
  }
}

async function tick() {
  if (!scanning) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const canvas  = document.createElement("canvas");
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qr  = jsQR(img.data, canvas.width, canvas.height);

    if (qr) {
      const toolId = (qr.data || "").trim().split(/[\n\r]/)[0].trim();
      if (toolId && TOOLS[toolId]) {
        const loc    = qr.location;
        const pts    = [loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner]
          .map((p) => videoToScreen(p, video));
        let minX = Infinity, maxX = -Infinity, minY = Infinity;
        pts.forEach((c) => {
          if (c.x < minX) minX = c.x;
          if (c.x > maxX) maxX = c.x;
          if (c.y < minY) minY = c.y;
        });
        positionLabel((minX + maxX) / 2, minY);

        if (currentTool !== toolId) {
          currentTool = toolId;
          statusEl.textContent = "TOOL DETECTED";
          await loadSession();
          const isOut = sessionData.some((t) => t.toolId === toolId);
          showLabel(toolId, isOut);
          setTimeout(() => { if (scanning) statusEl.textContent = "SCANNING…"; }, 1500);
        }
      }
    }
  requestAnimationFrame(tick);
}

// ─── AR label ─────────────────────────────────────────────────────────────────

function showLabel(toolId, isOut) {
  const info = TOOLS[toolId];
  tlTag.textContent    = isOut ? "CHECKED OUT" : "AVAILABLE";
  tlTag.className      = "label-tag";
  tlName.textContent   = info.name;
  tlStatus.textContent = `STATUS: ${isOut ? "OUT" : "IN"}`;
  tlType.textContent   = typeLabel(info.type);

  if (isOut) {
    tlAction.innerHTML = `<button class="btn btn-sm" id="tl-in-btn" style="width:100%;background:#10b981;">&#10003;&nbsp;Check In</button>`;
    document.getElementById("tl-in-btn").onclick = async () => {
      await checkinTool(toolId);
      hideLabel();
    };
  } else {
    tlAction.innerHTML = `
      <button class="btn btn-sm" id="tl-out-btn" style="width:100%;margin-bottom:6px;">&#9655;&nbsp;Check Out</button>
      <button class="btn secondary btn-sm" id="tl-fault-btn" style="width:100%;">&#128279;&nbsp;Link to Fault</button>`;
    document.getElementById("tl-out-btn").onclick = async () => {
      await checkoutTool(toolId, null);
      hideLabel();
    };
    document.getElementById("tl-fault-btn").onclick = () => showFaultInput(toolId);
  }

  labelEl.style.opacity = "1";
}

function showFaultInput(toolId) {
  tlStatus.textContent = "LINK TO FAULT";
  tlAction.innerHTML = `
    <input id="tl-fault-input" class="tt-fault-input" placeholder="e.g. FAULT-101" type="text" autocomplete="off">
    <div style="display:flex;gap:6px;margin-top:6px;">
      <button class="btn btn-sm" id="tl-confirm-btn" style="flex:1;">Confirm</button>
      <button class="btn secondary btn-sm" id="tl-cancel-btn" style="flex:1;">Back</button>
    </div>`;
  document.getElementById("tl-confirm-btn").onclick = async () => {
    const faultId = document.getElementById("tl-fault-input").value.trim() || null;
    await checkoutTool(toolId, faultId);
    hideLabel();
  };
  document.getElementById("tl-cancel-btn").onclick = () => showLabel(toolId, false);
}

function hideLabel() {
  labelEl.style.opacity   = "0";
  labelEl.style.transform = "translate(-9999px,-9999px)";
  currentTool = null;
}

function positionLabel(x, y) {
  labelEl.style.transform = `translate(${x + 20}px, ${y - 80}px)`;
}

function videoToScreen(pt, vid) {
  const scale = Math.max(vid.clientWidth / vid.videoWidth, vid.clientHeight / vid.videoHeight);
  const offX  = (vid.clientWidth  - vid.videoWidth  * scale) / 2;
  const offY  = (vid.clientHeight - vid.videoHeight * scale) / 2;
  return { x: pt.x * scale + offX, y: pt.y * scale + offY };
}

// ─── API actions ──────────────────────────────────────────────────────────────

async function checkoutTool(toolId, faultId) {
  try {
    const res = await Auth.fetch("/api/tools/checkout", {
      method: "POST",
      body: JSON.stringify({ toolId, faultId }),
    });
    if (res.ok) {
      statusEl.textContent = "CHECKED OUT";
      await loadSession();
      setTimeout(() => { if (scanning) statusEl.textContent = "SCANNING…"; }, 1500);
    }
  } catch (_) {}
}

async function checkinTool(toolId) {
  try {
    const res = await Auth.fetch("/api/tools/checkin", {
      method: "POST",
      body: JSON.stringify({ toolId }),
    });
    if (res.ok) {
      statusEl.textContent = "CHECKED IN";
      await loadSession();
      setTimeout(() => { if (scanning) statusEl.textContent = "SCANNING…"; }, 1500);
    }
  } catch (_) {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeLabel(type) {
  return type === "electronic" ? "Electronic instrument"
       : type === "hand"       ? "Hand tool"
       : "Inspection tool";
}

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
