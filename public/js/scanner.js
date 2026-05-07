// Scanner logic.
// QR codes are fixed physical markers. Once detected the detail panel locks on
// and stays visible until the engineer explicitly dismisses it.
// INT-01: Mark as Fixed routes to tool-check.html (SWE-03) for pre-close tool verification.
// SWE-04: Add Note submits annotations to POST /api/faults/:id/notes.

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
  const panel          = document.getElementById("detail-panel");
  const dpId           = document.getElementById("dp-id");
  const dpStatusBadge  = document.getElementById("dp-status-badge");
  const dpPriority     = document.getElementById("dp-priority-badge");
  const dpTitle        = document.getElementById("dp-title");
  const dpLocation     = document.getElementById("dp-location");
  const dpDesc         = document.getElementById("dp-desc");
  const dpComponent    = document.getElementById("dp-component");
  const dpImage        = document.getElementById("dp-image");
  const dpDismissBtn   = document.getElementById("dp-dismiss-btn");
  const dpFixBtn       = document.getElementById("dp-fix-btn");
  const dpAnnotateBtn  = document.getElementById("dp-annotate-btn");
  const dpNoteForm     = document.getElementById("dp-note-form");
  const dpNoteInput    = document.getElementById("dp-note-input");
  const dpNoteSubmit   = document.getElementById("dp-note-submit");
  const dpNoteCancel   = document.getElementById("dp-note-cancel");
  const dpNoteStatus   = document.getElementById("dp-note-status");
  const dpNotesList    = document.getElementById("dp-notes-list");

  const faultCache = new Map();
  const inflight   = new Map();

  let panelLocked  = false;
  let currentFault = null;
  let lastSeen     = 0;
  const HOLD_MS    = 400;

  // ── Annotation (SWE-04) ────────────────────────────────────────────────────

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
    if (!notes || notes.length === 0) {
      dpNotesList.innerHTML = "";
      return;
    }
    dpNotesList.innerHTML = notes.map((n) => `
      <div class="dp-note-item">
        <span class="dp-note-author">${escapeHtml(n.author)}</span>
        <span class="dp-note-text">${escapeHtml(n.text)}</span>
        <span class="dp-note-time">${formatTime(n.timestamp)}</span>
      </div>
    `).join("");
  }

  // ── Detail panel ───────────────────────────────────────────────────────────

  function showPanel(fault) {
    const isFixed = fault.status === "FIXED";
    currentFault  = fault;

    dpId.textContent = fault.id;
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

    // Reset annotation form
    dpNoteForm.classList.add("hidden");
    dpNoteInput.value = "";
    dpNoteStatus.classList.add("hidden");

    if (isFixed) {
      dpFixBtn.style.display     = "none";
      dpAnnotateBtn.style.display = "none";
    } else {
      dpFixBtn.style.display     = "";
      dpAnnotateBtn.style.display = "";
      dpFixBtn.onclick = () => {
        window.location.href = `/tool-check.html?fault=${encodeURIComponent(fault.id)}`;
      };
    }

    panel.classList.remove("hidden");
    panelLocked = true;
    reticle.classList.add("hidden");
    hint.classList.add("hidden");
    statusText.textContent = isFixed ? "FAULT CLOSED" : "MARKER LOCKED";
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
          statusText.textContent = "VERIFYING...";
          drawMarker(corners, false);
          lookupFault(id).then((fault) => {
            if (fault !== undefined) showPanel(fault);
          });
        } else {
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
            notes: [],
          });
        }
      } else if (!panelLocked && performance.now() - lastSeen > HOLD_MS) {
        overlayCtx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight);
      }
    }
    requestAnimationFrame(tick);
  }
}
