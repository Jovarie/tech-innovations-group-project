const express = require("express");
const crypto  = require("crypto");
const fs      = require("fs");
const path    = require("path");
const { authRequired } = require("../middleware/auth");
const rbacMiddleware   = require("../middleware/rbacMiddleware");

const router = express.Router();

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const SESSION_KEY = "ar:tool-session";
const HISTORY_KEY = "ar:tool-history";

const LOCAL_SESSION = path.join(__dirname, "../../data/tool-session.json");
const LOCAL_HISTORY = path.join(__dirname, "../../data/tool-history.json");

async function redisGet(key) {
  const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const { result } = await r.json();
  return result ? JSON.parse(result) : null;
}

async function redisSet(key, value) {
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify([JSON.stringify(value)]),
  });
}

async function getSession() {
  if (REDIS_URL) return (await redisGet(SESSION_KEY)) || [];
  try { return JSON.parse(fs.readFileSync(LOCAL_SESSION, "utf8")); } catch { return []; }
}

async function putSession(data) {
  if (REDIS_URL) { await redisSet(SESSION_KEY, data); return; }
  try { fs.writeFileSync(LOCAL_SESSION, JSON.stringify(data)); } catch {}
}

async function getHistory() {
  if (REDIS_URL) return (await redisGet(HISTORY_KEY)) || [];
  try { return JSON.parse(fs.readFileSync(LOCAL_HISTORY, "utf8")); } catch { return []; }
}

async function putHistory(data) {
  if (REDIS_URL) { await redisSet(HISTORY_KEY, data); return; }
  try { fs.writeFileSync(LOCAL_HISTORY, JSON.stringify(data)); } catch {}
}

const TOOLS = {
  "TOOL-WRENCH-01":  { id: "TOOL-WRENCH-01",  name: "Adjustable Wrench", type: "hand"       },
  "TOOL-MULTI-02":   { id: "TOOL-MULTI-02",   name: "Multimeter",        type: "electronic" },
  "TOOL-TORCH-03":   { id: "TOOL-TORCH-03",   name: "Inspection Torch",  type: "light"      },
  "TOOL-THERMAL-04": { id: "TOOL-THERMAL-04", name: "Thermal Camera",    type: "electronic" },
  "TOOL-PROBE-06":   { id: "TOOL-PROBE-06",   name: "Voltage Probe",     type: "electronic" },
  "TOOL-TAPE-07":    { id: "TOOL-TAPE-07",    name: "Insulation Tape",   type: "hand"       },
  "TOOL-GAUGE-05":   { id: "TOOL-GAUGE-05",   name: "Crack Gauge",       type: "hand"       },
};

// GET /api/tools/session — current checkouts + full tool list
router.get(
  "/tools/session",
  authRequired,
  rbacMiddleware.checkPermission("read_ar"),
  async (req, res) => {
    try {
      const activeCheckouts = await getSession();
      const detailed = activeCheckouts.map((t) => ({
        ...t,
        toolDetails: TOOLS[t.toolId] || null,
      }));
      res.json({ activeTools: detailed, allTools: Object.values(TOOLS) });
    } catch (err) {
      res.status(500).json({ error: "Failed to load tool session" });
    }
  },
);

// POST /api/tools/checkout
router.post(
  "/tools/checkout",
  authRequired,
  rbacMiddleware.checkPermission("execute_ar"),
  async (req, res) => {
    const { toolId, faultId } = req.body || {};
    const tool = TOOLS[toolId];
    if (!tool) return res.status(404).json({ error: "Tool not found" });

    try {
      const activeCheckouts = await getSession();
      if (activeCheckouts.find((t) => t.toolId === toolId)) {
        return res.status(409).json({ error: "Tool already checked out" });
      }

      const entry = {
        toolId,
        checkedOutBy: req.user.username,
        checkedOutAt: new Date().toISOString(),
        faultId: faultId || null,
      };
      activeCheckouts.push(entry);

      const history = await getHistory();
      history.push({
        id:        crypto.randomUUID(),
        toolId,
        toolName:  tool.name,
        action:    "CHECKOUT",
        user:      req.user.username,
        faultId:   faultId || null,
        timestamp: new Date().toISOString(),
      });

      await Promise.all([putSession(activeCheckouts), putHistory(history)]);
      res.json({ success: true, checkout: entry });
    } catch (err) {
      res.status(500).json({ error: "Failed to checkout tool" });
    }
  },
);

// POST /api/tools/checkin
router.post(
  "/tools/checkin",
  authRequired,
  rbacMiddleware.checkPermission("execute_ar"),
  async (req, res) => {
    const { toolId } = req.body || {};

    try {
      const activeCheckouts = await getSession();
      const idx = activeCheckouts.findIndex((t) => t.toolId === toolId);
      if (idx === -1) return res.status(404).json({ error: "Tool not checked out" });

      const [checkout] = activeCheckouts.splice(idx, 1);

      const history = await getHistory();
      history.push({
        id:        crypto.randomUUID(),
        toolId,
        toolName:  TOOLS[toolId] ? TOOLS[toolId].name : toolId,
        action:    "CHECKIN",
        user:      req.user.username,
        faultId:   checkout.faultId || null,
        timestamp: new Date().toISOString(),
      });

      await Promise.all([putSession(activeCheckouts), putHistory(history)]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to checkin tool" });
    }
  },
);

// GET /api/tools/history — last 100 events, newest first
router.get(
  "/tools/history",
  authRequired,
  rbacMiddleware.checkPermission("read_ar"),
  async (req, res) => {
    try {
      const history = await getHistory();
      res.json({ history: history.slice(-100).reverse() });
    } catch (err) {
      res.status(500).json({ error: "Failed to load tool history" });
    }
  },
);

module.exports = router;
