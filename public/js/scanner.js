// Scanner logic.
// QR codes are fixed physical markers. Once a code is detected and the fault
// looked up, the detail panel locks on and stays visible until the engineer
// explicitly dismisses it — no need to keep the camera aimed at the marker.
// INT-01: "Mark as Fixed" fires PATCH /api/faults/:id/status to update the
// dashboard in real-time.

if (!Auth.requireAuth()) {
  // requireAuth redirects; nothing more to do.
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

  // Detail panel elements
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

  // Fix modal elements
  const fixModal       = document.getElementById("fix-modal");
  const fixModalTitle  = document.getElementById("fix-modal-title");
  const fixModalBody   = document.getElementById("fix-modal-body");
  const fixConfirmBtn  = document.getElementById("fix-confirm-btn");
  const fixCancelBtn   = document.getElementById("fix-cancel-btn");
  const fixModalStatus = document.getElementById("fix-modal-status");

  // Fault lookup cache
  const faultCache = new Map();
  const inflight   = new Map();

  // Once a fault is identified the panel locks — the QR does not need to
  // stay in frame. panelLocked prevents hidePanel() from firing mid-scan.
  let panelLocked   = false;
  let pendingFixId  = null;
  let lastSeen      = 0;
  const HOLD_MS     = 400;

  // ── Fix modal ──────────────────────────────────────────────────────────────

  fixCancelBtn.addEventListener("click", closeFixModal);

  fixConfirmBtn.addEventListener("click", async () => {
    if (!pendingFixId) return;
    fixConfirmBtn.disabled = true;
    fixCancelBtn.disabled  = true;
    fixConfirmBtn.textContent = "Sending...";
    fixModalStatus.classList.remove("hidden");
    fixModalStatus.textContent = "Contacting server...";

    try {
      const res = await Auth.fetch(
        `/api/faults/${encodeURIComponent(pendingFixId)}/status`,
        { method: "PATCH", body: JSON.stringify({ status: "FIXED" }) },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
      const updated = await res.json();
      faultCache.set(pendingFixId, updated);

      // Reflect the change immediately in the open panel
      showPanel(updated);

      fixModalStatus.textContent = "Dashboard updated in real-time.";
      fixModalStatus.style.color = "var(--ok)";
      fixConfirmBtn.textContent  = "Done";

      setTimeout(() => {
        closeFixModal();
        fixConfirmBtn.disabled    = false;
        fixCancelBtn.disabled     = false;
        fixConfirmBtn.textContent = "Confirm";
        fixModalStatus.style.color = "";
      }, 1800);
    } catch (err) {
      fixModalStatus.textContent = "Error: " + (err.message || "Unknown error");
      fixModalStatus.style.color = "var(--crit)";
      fixConfirmBtn.disabled     = false;
      fixCancelBtn.disabled      = false;
      fixConfirmBtn.textContent  = "Confirm";
    }
  });

  function openFixModal(fault) {
    pendingFixId = fault.id;
    fixModalTitle.textContent = `Close Fault: ${fault.id}`;
    fixModalBody.textContent  =
      `"${fault.title}" in ${fault.zone}. This will be marked FIXED and the Operations Dashboard will update immediately.`;
    fixModalStatus.classList.add("hidden");
    fixModalStatus.textContent = "";
    fixModal.classList.remove("hidden");
  }

  function closeFixModal() {
    fixModal.classList.add("hidden");
    pendingFixId = null;
  }

  // ── Detail panel ───────────────────────────────────────────────────────────

  function showPanel(fault) {
    const isFixed = fault.status === "FIXED";

    dpId.textContent = fault.id;

    dpStatusBadge.textContent  = fault.status;
    dpStatusBadge.className    = "dp-status-badge badge " + fault.status.toLowerCase().replace(/\s+/g, "-");

    dpPriority.textContent  = fault.priority;
    dpPriority.className    = "dp-priority-badge badge " + fault.priority.toLowerCase();

    dpTitle.textContent    = fault.title;
    dpLocation.textContent = `${fault.distance} ${fault.direction.toUpperCase()} // ${fault.zone}`;
    dpDesc.textContent     = fault.description;
    dpComponent.textContent = fault.component || "";

    if (fault.imageHint) {
      dpImage.src = fault.imageHint;
      dpImage.parentElement.style.display = "";
    } else {
      dpImage.parentElement.style.display = "none";
    }

    if (isFixed) {
      dpFixBtn.style.display = "none";
    } else {
      dpFixBtn.style.display = "";
      dpFixBtn.onclick = () => openFixModal(fault);
    }

    panel.classList.remove("hidden");
    panelLocked = true;

    reticle.classList.add("hidden");
    hint.classList.add("hidden");
    statusText.textContent = isFixed ? "FAULT CLOSED" : "MARKER LOCKED";
  }

  function hidePanel() {
    panel.classList.add("hidden");
    panelLocked = false;
    reticle.classList.remove("hidden");
    hint.classList.remove("hidden");
    statusText.textContent = "SCANNING";
    overlayCtx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight);
  }

  dpDismissBtn.addEventListener("click", hidePanel);

  // ── Overlay ────────────────────────────────────────────────────────────────

  function resizeOverlay() {
    overlay.width  = overlay.clientWidth  * window.devicePixelRatio;
    overlay.height = overlay.clientHeight * window.devicePixelRatio;
    overlayCtx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }
  window.addEventListener("resize", resizeOverlay);

  // ── Camera ─────────────────────────────────────────────────────────────────

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

  // ── Helpers ────────────────────────────────────────────────────────────────

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
        if (!res.ok) return null;
        const fault = await res.json();
        faultCache.set(id, fault);
        return fault;
      } catch (e) {
        return null;
      } finally {
        inflight.delete(id);
      }
    })();

    inflight.set(id, p);
    return p;
  }

  // ── Main render loop ───────────────────────────────────────────────────────

  function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const w = video.videoWidth, h = video.videoHeight;
      if (frameCanvas.width !== w || frameCanvas.height !== h) {
        frameCanvas.width = w;
        frameCanvas.height = h;
      }
      frameCtx.drawImage(video, 0, 0, w, h);
      const imageData = frameCtx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });

      if (code && code.location && !panelLocked) {
        lastSeen = performance.now();
        const id  = (code.data || "").trim();
        const loc = code.location;
        const corners = [
          loc.topLeftCorner, loc.topRightCorner,
          loc.bottomRightCorner, loc.bottomLeftCorner,
        ].map(videoToScreen);

        const cached = faultCache.has(id) ? faultCache.get(id) : undefined;

        if (cached === undefined) {
          // Not yet in cache — show scanning feedback and kick off lookup
          statusText.textContent = "VERIFYING...";
          drawMarker(corners, false);
          lookupFault(id).then((fault) => {
            if (fault !== undefined) showPanel(fault);
          });
        } else {
          // Already cached (including null for unknown IDs) — lock on immediately
          drawMarker(corners, !!cached);
          showPanel(cached || {
            id,
            title: "Unrecognised Marker",
            zone: "-",
            distance: "-",
            direction: "",
            priority: "LOW",
            status: "OPEN",
            description: "No matching fault record. Check marker integrity.",
            component: "",
            imageHint: null,
          });
        }
      } else if (!panelLocked && performance.now() - lastSeen > HOLD_MS) {
        overlayCtx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight);
      }
    }
    requestAnimationFrame(tick);
  }
}
