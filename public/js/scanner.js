// Scanner logic.
// Unrecognised QR codes show a read-only panel — no repair actions.
// Recognised fault QRs enter a 3-step repair workflow:
//   Step 1 — scan tool QR codes to check out tools for the job
//   Step 2 — sequential PPE / documentation / diagnostic confirmation
//   Step 3 — PATCH fault to FIXED, redirect to dashboard
// SWE-04: Add Note submits annotations to POST /api/faults/:id/notes.

if (!Auth.requireAuth()) {
  // requireAuth handles redirect
} else {
  initScanner();
}

function initScanner() {
  const video       = document.getElementById("video");
  const frameCanvas = document.getElementById("frame");
  const overlay     = document.getElementById("overlay");
  const overlayCtx  = overlay.getContext("2d");
  const frameCtx    = frameCanvas.getContext("2d", { willReadFrequently: true });

  const reticle    = document.getElementById("reticle");
  const hint       = document.getElementById("hint");
  const statusText = document.getElementById("status-text");
  const gate       = document.getElementById("gate");
  const startBtn   = document.getElementById("start-btn");
  const gateError  = document.getElementById("gate-error");

  // Detail panel
  const panel         = document.getElementById("detail-panel");
  const dpId          = document.getElementById("dp-id");
  const dpStatusBadge = document.getElementById("dp-status-badge");
  const dpPriority    = document.getElementById("dp-priority-badge");
  const dpTitle       = document.getElementById("dp-title");
  const dpLocation    = document.getElementById("dp-location");
  const dpDesc        = document.getElementById("dp-desc");
  const dpComponent   = document.getElementById("dp-component");
  const dpImage       = document.getElementById("dp-image");
  const dpDismissBtn  = document.getElementById("dp-dismiss-btn");
  const dpFixBtn      = document.getElementById("dp-fix-btn");
  const dpAnnotateBtn = document.getElementById("dp-annotate-btn");
  const dpNoteForm    = document.getElementById("dp-note-form");
  const dpNoteInput   = document.getElementById("dp-note-input");
  const dpNoteSubmit  = document.getElementById("dp-note-submit");
  const dpNoteCancel  = document.getElementById("dp-note-cancel");
  const dpNoteStatus  = document.getElementById("dp-note-status");
  const dpNotesList   = document.getElementById("dp-notes-list");

  // Workflow step panels
  const stepTools      = document.getElementById("step-tools");
  const wfToolsFault   = document.getElementById("wf-tools-fault");
  const wfToolsList    = document.getElementById("wf-tool-list");
  const wfToolsBack    = document.getElementById("wf-tools-back");
  const wfToolsNext    = document.getElementById("wf-tools-next");

  const stepVerify     = document.getElementById("step-verify");
  const wfVerifyCard   = document.getElementById("wf-verify-card");
  const wfVerifyCount  = document.getElementById("wf-verify-count");
  const wfVerifyFill   = document.getElementById("wf-verify-fill");
  const wfVerifyBack   = document.getElementById("wf-verify-back");
  const wfVerifyConfirm = document.getElementById("wf-verify-confirm");

  // ── Workflow constants ──────────────────────────────────────────────────────

  const TOOL_REGISTRY = {
    "TOOL-WRENCH-01":  { name: "Adjustable Wrench", type: "hand"       },
    "TOOL-MULTI-02":   { name: "Multimeter",         type: "electronic" },
    "TOOL-TORCH-03":   { name: "Inspection Torch",   type: "light"      },
    "TOOL-THERMAL-04": { name: "Thermal Camera",     type: "electronic" },
    "TOOL-PROBE-06":   { name: "Voltage Probe",      type: "electronic" },
    "TOOL-TAPE-07":    { name: "Insulation Tape",    type: "hand"       },
    "TOOL-GAUGE-05":   { name: "Crack Gauge",        type: "hand"       },
  };

  // Per-fault required tool lists — only these need to be scanned to proceed
  const FAULT_TOOL_MAP = {
    "FAULT-101": ["TOOL-MULTI-02",   "TOOL-PROBE-06"],
    "FAULT-102": ["TOOL-WRENCH-01",  "TOOL-THERMAL-04", "TOOL-TAPE-07"],
    "FAULT-103": ["TOOL-TORCH-03",   "TOOL-GAUGE-05"],
  };

  let requiredToolIds = [];

  const VERIFY_STEPS = [
    {
      name:   "Personal Protective Equipment",
      detail: "Hard hat, insulated gloves and hi-visibility vest confirmed at site.",
    },
    {
      name:   "Service Documentation Signed",
      detail: "Job card and fault report sheet completed. Authorisation code recorded.",
    },
    {
      name:   "Diagnostic Instrument",
      detail: "Calibrated multimeter, voltage probe and test leads present and functional.",
    },
  ];

  // ── Scanner state ───────────────────────────────────────────────────────────

  const faultCache = new Map();
  const inflight   = new Map();

  let panelLocked  = false;
  let currentFault = null;
  let lastSeen     = 0;
  const HOLD_MS    = 400;

  // Workflow state
  let scanMode     = "fault";   // "fault" | "tools"
  let scannedTools = new Set();
  let verifyIndex  = 0;

  // ── Annotation (SWE-04) ─────────────────────────────────────────────────────

  dpAnnotateBtn.addEventListener("click", () => {
    dpNoteForm.classList.toggle("hidden");
    if (!dpNoteForm.classList.contains("hidden")) dpNoteInput.focus();
  });

  dpNoteCancel.addEventListener("click", () => {
    dpNoteForm.classList.add("hidden");
    dpNoteInput.value = "";
    dpNoteStatus.classList.add("hidden");
  });

  dpNoteSubmit.addEventListener("click", async () => {
    const text = dpNoteInput.value.trim();
    if (!text || !currentFault) return;

    dpNoteSubmit.disabled = true;
    dpNoteStatus.classList.remove("hidden");
    dpNoteStatus.textContent = "Saving...";
    dpNoteStatus.style.color = "";

    try {
      const user = Auth.getUser();
      const res  = await Auth.fetch(
        `/api/faults/${encodeURIComponent(currentFault.id)}/notes`,
        { method: "POST", body: JSON.stringify({ text, author: user ? user.username : "engineer" }) },
      );
      if (!res.ok) throw new Error("Save failed");
      const updated = await res.json();
      faultCache.set(currentFault.id, updated);
      currentFault = updated;
      renderNotes(updated.notes || []);
      dpNoteInput.value = "";
      dpNoteStatus.textContent = "Note saved.";
      dpNoteStatus.style.color = "var(--ok)";
      setTimeout(() => {
        dpNoteForm.classList.add("hidden");
        dpNoteStatus.classList.add("hidden");
      }, 1400);
    } catch (err) {
      dpNoteStatus.textContent = "Error: " + (err.message || "Unknown");
      dpNoteStatus.style.color = "var(--crit)";
    } finally {
      dpNoteSubmit.disabled = false;
    }
  });

  function renderNotes(notes) {
    if (!notes || !notes.length) { dpNotesList.innerHTML = ""; return; }
    dpNotesList.innerHTML = notes.map((n) => `
      <div class="dp-note-item">
        <span class="dp-note-author">${escapeHtml(n.author)}</span>
        <span class="dp-note-text">${escapeHtml(n.text)}</span>
        <span class="dp-note-time">${formatTime(n.timestamp)}</span>
      </div>`).join("");
  }

  // ── Detail panel ────────────────────────────────────────────────────────────

  function showPanel(fault, recognised) {
    currentFault = recognised ? fault : null;
    const isFixed = recognised && fault.status === "FIXED";

    dpId.textContent = fault.id;

    if (!recognised) {
      dpStatusBadge.textContent = "UNRECOGNISED";
      dpStatusBadge.className   = "dp-status-badge badge";
      dpPriority.textContent    = "";
      dpPriority.className      = "dp-priority-badge badge";
      dpTitle.textContent       = "Unknown Marker";
      dpLocation.textContent    = "Not in fault registry";
      dpDesc.textContent        = "This QR code has no matching fault record. Check the physical marker is intact and correctly placed.";
      dpComponent.textContent   = "";
      dpImage.parentElement.style.display = "none";
      dpFixBtn.style.display      = "none";
      dpAnnotateBtn.style.display = "none";
      dpNotesList.innerHTML       = "";
    } else {
      dpStatusBadge.textContent = fault.status;
      dpStatusBadge.className   = "dp-status-badge badge " + fault.status.toLowerCase().replace(/\s+/g, "-");
      dpPriority.textContent    = fault.priority;
      dpPriority.className      = "dp-priority-badge badge " + fault.priority.toLowerCase();
      dpTitle.textContent       = fault.title;
      dpLocation.textContent    = `${fault.distance} ${fault.direction.toUpperCase()} // ${fault.zone}`;
      dpDesc.textContent        = fault.description;
      dpComponent.textContent   = fault.component || "";

      if (fault.imageHint) {
        dpImage.src = fault.imageHint;
        dpImage.parentElement.style.display = "";
      } else {
        dpImage.parentElement.style.display = "none";
      }

      renderNotes(fault.notes || []);

      if (isFixed) {
        dpFixBtn.style.display      = "none";
        dpAnnotateBtn.style.display = "none";
      } else {
        dpFixBtn.style.display      = "";
        dpAnnotateBtn.style.display = "";
        dpFixBtn.onclick = beginRepair;
      }
    }

    dpNoteForm.classList.add("hidden");
    dpNoteInput.value = "";
    dpNoteStatus.classList.add("hidden");

    panel.classList.remove("hidden");
    panelLocked = true;
    reticle.classList.add("hidden");
    hint.classList.add("hidden");
    statusText.textContent = isFixed ? "FAULT CLOSED" : recognised ? "MARKER LOCKED" : "UNRECOGNISED";
  }

  function hidePanel() {
    panel.classList.add("hidden");
    panelLocked  = false;
    currentFault = null;
    reticle.classList.remove("hidden");
    hint.classList.remove("hidden");
    statusText.textContent = "SCANNING";
    overlayCtx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight);
  }

  dpDismissBtn.addEventListener("click", hidePanel);

  // ── Repair workflow ─────────────────────────────────────────────────────────

  function beginRepair() {
    if (!currentFault) return;
    scannedTools.clear();
    requiredToolIds = FAULT_TOOL_MAP[currentFault.id] || Object.keys(TOOL_REGISTRY);
    scanMode = "tools";
    panel.classList.add("hidden");
    wfToolsFault.textContent = currentFault.id + " // " + currentFault.title;
    stepTools.classList.remove("hidden");
    statusText.textContent = "SCAN TOOLS";
    renderToolStep();
  }

  function renderToolStep() {
    const allRequired = requiredToolIds.every((id) => scannedTools.has(id));
    wfToolsNext.disabled = !allRequired;

    wfToolsList.innerHTML = requiredToolIds.map((id) => {
      const tool = TOOL_REGISTRY[id];
      const done = scannedTools.has(id);
      return `<div class="wf-tool-row${done ? " wf-tool-scanned" : ""}">
        <div class="wf-tool-info">
          <span class="wf-tool-name">${escapeHtml(tool ? tool.name : id)}</span>
          <span class="wf-tool-badge">REQUIRED</span>
        </div>
        <span class="wf-tool-check">${done ? "&#10003;" : "&#9675;"}</span>
      </div>`;
    }).join("");
  }

  wfToolsBack.addEventListener("click", () => {
    scanMode = "fault";
    scannedTools.clear();
    stepTools.classList.add("hidden");
    panel.classList.remove("hidden");
    statusText.textContent = "MARKER LOCKED";
  });

  wfToolsNext.addEventListener("click", () => {
    // Call checkout API for each scanned tool
    scannedTools.forEach((toolId) => {
      Auth.fetch("/api/tools/checkout", {
        method: "POST",
        body: JSON.stringify({ toolId, faultId: currentFault.id }),
      }).catch(() => {});
    });

    scanMode = "fault";
    stepTools.classList.add("hidden");
    verifyIndex = 0;
    stepVerify.classList.remove("hidden");
    statusText.textContent = "VERIFYING";
    renderVerifyStep();
  });

  function renderVerifyStep() {
    wfVerifyCount.textContent   = String(verifyIndex);
    wfVerifyFill.style.width    = `${(verifyIndex / VERIFY_STEPS.length) * 100}%`;

    if (verifyIndex >= VERIFY_STEPS.length) {
      wfVerifyCard.innerHTML = `
        <div class="wf-all-done">
          <div class="wf-done-icon">&#10003;</div>
          <div class="wf-done-title">All checks passed</div>
          <div class="wf-done-sub">Ready to close fault.</div>
        </div>`;
      wfVerifyConfirm.innerHTML = "&#9655;&nbsp; Close Fault";
      wfVerifyConfirm.onclick   = completeFix;
      return;
    }

    const step = VERIFY_STEPS[verifyIndex];
    wfVerifyCard.innerHTML = `
      <div class="wf-verify-num">CHECK ${verifyIndex + 1} OF ${VERIFY_STEPS.length}</div>
      <div class="wf-verify-name">${escapeHtml(step.name)}</div>
      <div class="wf-verify-detail">${escapeHtml(step.detail)}</div>`;
    wfVerifyConfirm.innerHTML = "&#10003;&nbsp; Confirm Present";
    wfVerifyConfirm.onclick   = () => { verifyIndex++; renderVerifyStep(); };
  }

  wfVerifyBack.addEventListener("click", () => {
    stepVerify.classList.add("hidden");
    scanMode = "tools";
    stepTools.classList.remove("hidden");
    statusText.textContent = "SCAN TOOLS";
    renderToolStep();
  });

  async function completeFix() {
    wfVerifyConfirm.disabled  = true;
    wfVerifyConfirm.innerHTML = "Submitting…";

    try {
      const res = await Auth.fetch(
        `/api/faults/${encodeURIComponent(currentFault.id)}/status`,
        { method: "PATCH", body: JSON.stringify({ status: "FIXED" }) },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
      const updated = await res.json();
      faultCache.set(updated.id, updated);

      stepVerify.classList.add("hidden");
      statusText.textContent = "FAULT CLOSED";

      const flash = document.createElement("div");
      flash.className = "wf-success-flash";
      flash.innerHTML = `
        <div class="wf-success-icon">&#10003;</div>
        <div class="wf-success-title">FAULT CLOSED</div>
        <div class="wf-success-id">${escapeHtml(updated.id)} // ${escapeHtml(updated.title)}</div>
        <div class="wf-success-sub">Redirecting to dashboard…</div>`;
      document.getElementById("scene").appendChild(flash);

      setTimeout(() => { window.location.href = "/dashboard.html"; }, 2600);
    } catch (err) {
      wfVerifyConfirm.disabled  = false;
      wfVerifyConfirm.innerHTML = "Retry — " + escapeHtml(err.message || "Unknown error");
      setTimeout(() => {
        wfVerifyConfirm.innerHTML = "&#9655;&nbsp; Close Fault";
        wfVerifyConfirm.onclick   = completeFix;
      }, 3000);
    }
  }

  // ── Overlay ─────────────────────────────────────────────────────────────────

  function resizeOverlay() {
    overlay.width  = overlay.clientWidth  * window.devicePixelRatio;
    overlay.height = overlay.clientHeight * window.devicePixelRatio;
    overlayCtx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }
  window.addEventListener("resize", resizeOverlay);

  // ── Camera ───────────────────────────────────────────────────────────────────

  async function startCamera() {
    gateError.textContent = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      gate.classList.add("hidden");
      resizeOverlay();
      requestAnimationFrame(tick);
    } catch (err) {
      gateError.textContent = "Camera unavailable: " + (err.message || err);
    }
  }
  startBtn.addEventListener("click", startCamera);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function videoToScreen(pt) {
    const vw = video.videoWidth,  vh = video.videoHeight;
    const cw = video.clientWidth, ch = video.clientHeight;
    if (!vw || !vh) return { x: 0, y: 0 };
    const scale = Math.max(cw / vw, ch / vh);
    const offX  = (cw - vw * scale) / 2;
    const offY  = (ch - vh * scale) / 2;
    return { x: pt.x * scale + offX, y: pt.y * scale + offY };
  }

  function drawMarker(corners, recognised) {
    const colour = recognised ? "#00f0ff" : "#ffcc00";
    overlayCtx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight);
    overlayCtx.lineWidth   = 2;
    overlayCtx.strokeStyle = colour;
    overlayCtx.shadowColor = colour;
    overlayCtx.shadowBlur  = 12;
    overlayCtx.beginPath();
    overlayCtx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) overlayCtx.lineTo(corners[i].x, corners[i].y);
    overlayCtx.closePath();
    overlayCtx.stroke();
    corners.forEach((c) => {
      overlayCtx.beginPath();
      overlayCtx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      overlayCtx.fillStyle = colour;
      overlayCtx.fill();
    });
  }

  async function lookupFault(id) {
    if (faultCache.has(id)) return faultCache.get(id);
    if (inflight.has(id))   return inflight.get(id);

    const p = (async () => {
      try {
        const res = await Auth.fetch("/api/faults/" + encodeURIComponent(id));
        if (res.status === 404) { faultCache.set(id, null); return null; }
        if (!res.ok) return undefined;
        const fault = await res.json();
        faultCache.set(id, fault);
        return fault;
      } catch { return undefined; }
      finally  { inflight.delete(id); }
    })();

    inflight.set(id, p);
    return p;
  }

  function formatTime(iso) {
    try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  }

  // ── Main render loop ─────────────────────────────────────────────────────────

  function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const w = video.videoWidth, h = video.videoHeight;
      if (frameCanvas.width !== w || frameCanvas.height !== h) {
        frameCanvas.width = w; frameCanvas.height = h;
      }
      frameCtx.drawImage(video, 0, 0, w, h);
      const imageData = frameCtx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });

      if (code && code.location) {
        const rawData = (code.data || "").trim();
        const id      = rawData.split(/[\n\r]/)[0].trim();
        const corners = [
          code.location.topLeftCorner, code.location.topRightCorner,
          code.location.bottomRightCorner, code.location.bottomLeftCorner,
        ].map(videoToScreen);

        if (scanMode === "tools") {
          // Tool-scan mode: only react to known tool QR codes
          const known = id in TOOL_REGISTRY;
          drawMarker(corners, known);
          if (known && !scannedTools.has(id)) {
            scannedTools.add(id);
            statusText.textContent = "TOOL SCANNED";
            renderToolStep();
            setTimeout(() => { statusText.textContent = "SCAN TOOLS"; }, 1200);
          }
        } else if (!panelLocked) {
          // Fault-scan mode: look up QR against fault registry
          lastSeen = performance.now();
          const cached = faultCache.has(id) ? faultCache.get(id) : undefined;

          if (cached === undefined) {
            statusText.textContent = "VERIFYING...";
            drawMarker(corners, false);
            lookupFault(id).then((result) => {
              if (panelLocked) return; // already handled
              if (result) {
                showPanel(result, true);
              } else if (result === null) {
                showPanel({ id }, false);
              }
              // undefined = network error, stay scanning
            });
          } else if (cached) {
            drawMarker(corners, true);
            showPanel(cached, true);
          } else {
            // null — confirmed not in registry
            drawMarker(corners, false);
            showPanel({ id }, false);
          }
        }
      } else if (!panelLocked && scanMode === "fault" && performance.now() - lastSeen > HOLD_MS) {
        overlayCtx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight);
      }
    }
    requestAnimationFrame(tick);
  }
}
