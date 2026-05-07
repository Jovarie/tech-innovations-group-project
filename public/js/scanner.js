// Scanner page logic.
// 1. Open the rear camera.
// 2. Decode QR codes from each frame using jsQR.
// 3. Look up the QR payload via the protected /api/faults/:id endpoint.
// 4. Float a label above the marker. Non-fixed faults show a "Mark as Fixed" button.
// INT-01: Confirming a fix sends PATCH /api/faults/:id/status to update the Dashboard in real-time.

if (!Auth.requireAuth()) {
  // requireAuth redirects, nothing more to do.
} else {
  initScanner();
}

function initScanner() {
  const video       = document.getElementById("video");
  const frameCanvas = document.getElementById("frame");
  const overlay     = document.getElementById("overlay");
  const overlayCtx  = overlay.getContext("2d");
  const frameCtx    = frameCanvas.getContext("2d", { willReadFrequently: true });

  const labelEl    = document.getElementById("label");
  const titleEl    = document.getElementById("label-title");
  const dirEl      = document.getElementById("label-direction");
  const descEl     = document.getElementById("label-desc");
  const priorityEl = document.getElementById("label-priority");
  const zoneEl     = document.getElementById("label-zone");
  const tagEl      = document.getElementById("label-tag");

  const labelActions = document.getElementById("label-actions");
  const fixBtn       = document.getElementById("fix-btn");

  const fixModal        = document.getElementById("fix-modal");
  const fixModalTitle   = document.getElementById("fix-modal-title");
  const fixModalBody    = document.getElementById("fix-modal-body");
  const fixConfirmBtn   = document.getElementById("fix-confirm-btn");
  const fixCancelBtn    = document.getElementById("fix-cancel-btn");
  const fixModalStatus  = document.getElementById("fix-modal-status");

  const reticle    = document.getElementById("reticle");
  const hint       = document.getElementById("hint");
  const statusText = document.getElementById("status-text");
  const gate       = document.getElementById("gate");
  const startBtn   = document.getElementById("start-btn");
  const gateError  = document.getElementById("gate-error");

  // Cache fault lookups so we don't overload the backend every frame.
  const faultCache = new Map(); // id -> { fault | null }
  const inflight   = new Map(); // id -> Promise

  let lastSeen    = 0;
  let activeId    = null;
  let pendingFixId = null;
  const HOLD_MS   = 350;

  // ─── Fix modal wiring ────────────────────────────────────────────────────

  fixCancelBtn.addEventListener("click", closeFixModal);

  fixConfirmBtn.addEventListener("click", async () => {
    if (!pendingFixId) return;
    fixConfirmBtn.disabled = true;
    fixCancelBtn.disabled  = true;
    fixConfirmBtn.textContent = "Sending…";
    fixModalStatus.classList.remove("hidden");
    fixModalStatus.textContent = "Contacting server…";

    try {
      // INT-01: Send API call to mark fault as fixed and update dashboard in real-time
      const res = await Auth.fetch(
        `/api/faults/${encodeURIComponent(pendingFixId)}/status`,
        { method: "PATCH", body: JSON.stringify({ status: "FIXED" }) },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
      const updated = await res.json();

      // Bust the local cache so the label reflects the new status on next scan
      faultCache.set(pendingFixId, updated);

      fixModalStatus.textContent = "✓ Dashboard updated in real-time.";
      fixModalStatus.style.color = "var(--ok)";
      fixConfirmBtn.textContent  = "Done";

      setTimeout(() => {
        closeFixModal();
        fixConfirmBtn.disabled = false;
        fixCancelBtn.disabled  = false;
        fixConfirmBtn.textContent = "✓  Confirm";
        fixModalStatus.style.color = "";
      }, 1800);
    } catch (err) {
      fixModalStatus.textContent = "Error: " + (err.message || "Unknown error");
      fixModalStatus.style.color = "var(--crit)";
      fixConfirmBtn.disabled = false;
      fixCancelBtn.disabled  = false;
      fixConfirmBtn.textContent = "✓  Confirm";
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

  // ─── Overlay resize ──────────────────────────────────────────────────────

  function resizeOverlay() {
    overlay.width  = overlay.clientWidth  * window.devicePixelRatio;
    overlay.height = overlay.clientHeight * window.devicePixelRatio;
    overlayCtx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }
  window.addEventListener("resize", resizeOverlay);

  // ─── Camera startup ──────────────────────────────────────────────────────

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
      console.error(err);
      gateError.textContent =
        "Camera unavailable: " + (err && err.message ? err.message : err);
    }
  }
  startBtn.addEventListener("click", startCamera);

  // ─── Coordinate helpers ──────────────────────────────────────────────────

  function videoToScreen(pt) {
    const vw = video.videoWidth,  vh = video.videoHeight;
    const cw = video.clientWidth, ch = video.clientHeight;
    if (!vw || !vh) return { x: 0, y: 0 };
    const scale  = Math.max(cw / vw, ch / vh);
    const dispW  = vw * scale, dispH = vh * scale;
    const offX   = (cw - dispW) / 2, offY = (ch - dispH) / 2;
    return { x: pt.x * scale + offX, y: pt.y * scale + offY };
  }

  // ─── Canvas drawing ──────────────────────────────────────────────────────

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

  function clearOverlay() {
    overlayCtx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight);
  }

  // ─── Label rendering ─────────────────────────────────────────────────────

  function showLabelAt(screenCorners, fault) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity;
    screenCorners.forEach((c) => {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
    });
    const anchorX = (minX + maxX) / 2;
    const anchorY = minY;

    if (fault) {
      const isFixed = fault.status === "FIXED";
      tagEl.textContent    = isFixed ? `${fault.id} // CLOSED` : `${fault.id} // FAULT DETECTED`;
      tagEl.className      = isFixed ? "label-tag label-tag-fixed" : "label-tag";
      titleEl.textContent  = fault.title;
      dirEl.textContent    = `${fault.distance} ${fault.direction.toUpperCase()}`;
      descEl.textContent   = fault.description;
      priorityEl.textContent = `Priority: ${fault.priority}`;
      zoneEl.textContent   = fault.zone;

      if (isFixed) {
        labelActions.classList.add("hidden");
      } else {
        labelActions.classList.remove("hidden");
        fixBtn.onclick = () => openFixModal(fault);
      }
    } else {
      tagEl.textContent  = "UNKNOWN MARKER";
      tagEl.className    = "label-tag";
      titleEl.textContent = "Unrecognised QR Code";
      dirEl.textContent  = "-";
      descEl.textContent = "No matching fault record. Verify marker integrity.";
      priorityEl.textContent = "";
      zoneEl.textContent = "";
      labelActions.classList.add("hidden");
    }

    labelEl.style.transform = `translate(${anchorX}px, ${anchorY}px) translate(-50%, -100%)`;
    labelEl.classList.add("visible");
    reticle.classList.add("hidden");
    hint.classList.add("hidden");

    const fixedText = fault && fault.status === "FIXED" ? "FAULT CLOSED" : "MARKER LOCKED";
    statusText.textContent = fault ? fixedText : "UNKNOWN MARKER";
  }

  function hideLabel() {
    labelEl.classList.remove("visible");
    labelActions.classList.add("hidden");
    reticle.classList.remove("hidden");
    hint.classList.remove("hidden");
    statusText.textContent = "SCANNING…";
    activeId = null;
    clearOverlay();
  }

  // ─── Fault lookup ────────────────────────────────────────────────────────

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
        console.error(e);
        return null;
      } finally {
        inflight.delete(id);
      }
    })();

    inflight.set(id, p);
    return p;
  }

  // ─── Main render loop ────────────────────────────────────────────────────

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

      if (code && code.location) {
        lastSeen = performance.now();
        const id  = (code.data || "").trim();
        const loc = code.location;
        const screenCorners = [
          loc.topLeftCorner, loc.topRightCorner,
          loc.bottomRightCorner, loc.bottomLeftCorner,
        ].map(videoToScreen);

        let fault = faultCache.has(id) ? faultCache.get(id) : undefined;
        if (fault === undefined) {
          drawMarker(screenCorners, false);
          showLabelAt(screenCorners, null);
          tagEl.textContent  = `${id} // VERIFYING…`;
          titleEl.textContent = "Looking up fault record";
          descEl.textContent  = "Querying secure backend for marker details.";
          lookupFault(id);
          activeId = id;
        } else {
          activeId = id;
          drawMarker(screenCorners, !!fault);
          showLabelAt(screenCorners, fault);
        }
      } else if (performance.now() - lastSeen > HOLD_MS) {
        hideLabel();
      }
    }
    requestAnimationFrame(tick);
  }
}
