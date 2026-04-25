// Scanner page logic.
// 1. Open the rear camera.
// 2. Decode QR codes from each frame using jsQR.
// 3. Look up the QR payload via the protected /api/faults/:id endpoint.
// 4. Float a label above the marker showing direction, distance, and description.

// Auth gate — the scanner is restricted to authenticated maintenance staff.
if (!Auth.requireAuth()) {
  // requireAuth redirects, nothing more to do.
} else {
  initScanner();
}

function initScanner() {
  const video = document.getElementById("video");
  const frameCanvas = document.getElementById("frame");
  const overlay = document.getElementById("overlay");
  const overlayCtx = overlay.getContext("2d");
  const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });

  const labelEl = document.getElementById("label");
  const titleEl = document.getElementById("label-title");
  const dirEl = document.getElementById("label-direction");
  const descEl = document.getElementById("label-desc");
  const priorityEl = document.getElementById("label-priority");
  const zoneEl = document.getElementById("label-zone");
  const tagEl = document.getElementById("label-tag");

  const reticle = document.getElementById("reticle");
  const hint = document.getElementById("hint");
  const statusText = document.getElementById("status-text");
  const gate = document.getElementById("gate");
  const startBtn = document.getElementById("start-btn");
  const gateError = document.getElementById("gate-error");

  // Cache fault lookups so we don't overload the backend every frame.
  const faultCache = new Map(); // id -> { fault | null }   (null = unknown id)
  const inflight = new Map(); // id -> Promise

  let lastSeen = 0;
  let activeId = null;
  const HOLD_MS = 350;

  function resizeOverlay() {
    overlay.width = overlay.clientWidth * window.devicePixelRatio;
    overlay.height = overlay.clientHeight * window.devicePixelRatio;
    overlayCtx.setTransform(
      window.devicePixelRatio,
      0,
      0,
      window.devicePixelRatio,
      0,
      0,
    );
  }
  window.addEventListener("resize", resizeOverlay);

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

  function videoToScreen(pt) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = video.clientWidth;
    const ch = video.clientHeight;
    if (!vw || !vh) return { x: 0, y: 0 };
    const scale = Math.max(cw / vw, ch / vh);
    const dispW = vw * scale;
    const dispH = vh * scale;
    const offX = (cw - dispW) / 2;
    const offY = (ch - dispH) / 2;
    return { x: pt.x * scale + offX, y: pt.y * scale + offY };
  }

  function drawMarker(corners, recognised) {
    const colour = recognised ? "#00f0ff" : "#ffcc00";
    overlayCtx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight);
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeStyle = colour;
    overlayCtx.shadowColor = colour;
    overlayCtx.shadowBlur = 12;

    overlayCtx.beginPath();
    overlayCtx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
      overlayCtx.lineTo(corners[i].x, corners[i].y);
    }
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

  function showLabelAt(screenCorners, fault) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity;
    screenCorners.forEach((c) => {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
    });
    const anchorX = (minX + maxX) / 2;
    const anchorY = minY;

    if (fault) {
      tagEl.textContent = `${fault.id} // FAULT DETECTED`;
      titleEl.textContent = fault.title;
      dirEl.textContent = `${fault.distance} ${fault.direction.toUpperCase()}`;
      descEl.textContent = fault.description;
      priorityEl.textContent = `Priority: ${fault.priority}`;
      zoneEl.textContent = fault.zone;
    } else {
      tagEl.textContent = "UNKNOWN MARKER";
      titleEl.textContent = "Unrecognised QR Code";
      dirEl.textContent = "—";
      descEl.textContent = "No matching fault record. Verify marker integrity.";
      priorityEl.textContent = "";
      zoneEl.textContent = "";
    }

    labelEl.style.transform = `translate(${anchorX}px, ${anchorY}px) translate(-50%, -100%)`;
    labelEl.classList.add("visible");
    reticle.classList.add("hidden");
    hint.classList.add("hidden");
    statusText.textContent = fault ? "MARKER LOCKED" : "UNKNOWN MARKER";
  }

  function hideLabel() {
    labelEl.classList.remove("visible");
    reticle.classList.remove("hidden");
    hint.classList.remove("hidden");
    statusText.textContent = "SCANNING…";
    activeId = null;
    clearOverlay();
  }

  async function lookupFault(id) {
    if (faultCache.has(id)) return faultCache.get(id);
    if (inflight.has(id)) return inflight.get(id);

    const p = (async () => {
      try {
        const res = await Auth.fetch("/api/faults/" + encodeURIComponent(id));
        if (res.status === 404) {
          faultCache.set(id, null);
          return null;
        }
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

  function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (frameCanvas.width !== w || frameCanvas.height !== h) {
        frameCanvas.width = w;
        frameCanvas.height = h;
      }
      frameCtx.drawImage(video, 0, 0, w, h);
      const imageData = frameCtx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.location) {
        lastSeen = performance.now();
        const id = (code.data || "").trim();
        const loc = code.location;
        const screenCorners = [
          loc.topLeftCorner,
          loc.topRightCorner,
          loc.bottomRightCorner,
          loc.bottomLeftCorner,
        ].map(videoToScreen);

        // Pull the fault asynchronously; render with whatever we already have cached.
        let fault = faultCache.has(id) ? faultCache.get(id) : undefined;
        if (fault === undefined) {
          // Show a "looking up" state while we fetch.
          drawMarker(screenCorners, false);
          showLabelAt(screenCorners, null);
          tagEl.textContent = `${id} // VERIFYING…`;
          titleEl.textContent = "Looking up fault record";
          descEl.textContent = "Querying secure backend for marker details.";
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
