// AR-Enhanced Maintenance Support System
// Node.js + Express backend with JWT auth and a small fault registry.
// TRL 3 prototype — single user store, hardcoded faults, in-memory data.

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// In production this MUST come from an environment variable / secret manager.
// We generate a random one at startup so tokens don't survive a restart.
const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const TOKEN_TTL = "2h";

// ----- Middleware -----
app.use(cors());
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

// ----- Demo user store -----
// Single hard-coded engineer account. Password is hashed with bcrypt.
// In a real system this would be a database with proper user provisioning.
const USERS = [
  {
    id: "u-001",
    username: "engineer",
    role: "maintenance",
    // bcrypt hash of "maintain123"
    passwordHash: bcrypt.hashSync("maintain123", 10),
  },
];

// ----- Fault registry -----
// Three predefined faults. The QR code payload is the fault ID string.
// Map specific QR codes to "Xm right/left" instructions (MGMT-01).
const FAULTS = {
  "FAULT-101": {
    id: "FAULT-101",
    title: "Signal Fault",
    zone: "Track 1",
    distance: "10m",
    direction: "right",
    priority: "HIGH",
    status: "OPEN",
    description:
      "Signalling anomaly detected on Track 1. Aspect controller failing intermittently. Inspect relay cabinet on the right-hand side of the platform.",
    reportedAt: "2026-04-22T08:14:00Z",
  },
  "FAULT-102": {
    id: "FAULT-102",
    title: "Cable Degradation",
    zone: "Service Corridor B",
    distance: "5m",
    direction: "left",
    priority: "MEDIUM",
    status: "IN PROGRESS",
    description:
      "Insulation wear on traction power feeder cable. Visible cracking along 5m section to the left of the inspection door.",
    reportedAt: "2026-04-23T11:02:00Z",
  },
  "FAULT-103": {
    id: "FAULT-103",
    title: "Structural Wear",
    zone: "Tunnel Section B",
    distance: "15m",
    direction: "ahead",
    priority: "CRITICAL",
    status: "OPEN",
    description:
      "Hairline cracking along the tunnel lining 15m straight ahead. Water ingress observed. Schedule structural survey before next service window.",
    reportedAt: "2026-04-24T06:48:00Z",
  },
};

// ----- Auth helpers -----
function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ----- Routes -----

// CYB-01: Login route returns a signed JWT
app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }

  const user = USERS.find((u) => u.username === username);
  // Constant-time-ish: always run bcrypt.compare to avoid trivial username enumeration.
  const dummyHash =
    "$2a$10$CwTycUXWue0Thq9StjUM0uJ8N2u6mB0Wz0V9pH3l4cZJWJZ2C5cju";
  const ok = await bcrypt.compare(
    password,
    user ? user.passwordHash : dummyHash,
  );

  if (!user || !ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  );

  res.json({
    token,
    expiresIn: TOKEN_TTL,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

// Protected: list all faults (used by the dashboard)
app.get("/api/faults", authRequired, (req, res) => {
  res.json({ faults: Object.values(FAULTS) });
});

// Protected: look up a single fault by QR payload (used by the AR scanner)
app.get("/api/faults/:id", authRequired, (req, res) => {
  const fault = FAULTS[req.params.id];
  if (!fault) return res.status(404).json({ error: "Fault not found" });
  res.json(fault);
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// SPA fallback for the welcome page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AR Maintenance server running on http://localhost:${PORT}`);
});
