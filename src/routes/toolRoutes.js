const express = require("express");
const crypto  = require("crypto");
const fs      = require("fs");
const { authRequired } = require("../middleware/auth");
const rbacMiddleware   = require("../middleware/rbacMiddleware");

const router = express.Router();

const SESSION_FILE  = process.env.VERCEL ? "/tmp/tool-session.json"  : null;
const HISTORY_FILE  = process.env.VERCEL ? "/tmp/tool-history.json"  : null;

function readJson(file, fallback) {
  if (!file) return fallback;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) {
  if (!file) return;
  try { fs.writeFileSync(file, JSON.stringify(data)); } catch { /* ignore */ }
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

// Session arrays — written to /tmp on Vercel so same-instance requests stay in sync
let activeCheckouts = readJson(SESSION_FILE, []);
let toolHistory     = readJson(HISTORY_FILE, []);

// GET /api/tools/session — current checkouts + full tool list
router.get(
  "/tools/session",
  authRequired,
  rbacMiddleware.checkPermission("read_ar"),
  (req, res) => {
    activeCheckouts = readJson(SESSION_FILE, activeCheckouts);
    toolHistory     = readJson(HISTORY_FILE, toolHistory);
    const detailed = activeCheckouts.map((t) => ({
      ...t,
      toolDetails: TOOLS[t.toolId] || null,
    }));
    res.json({ activeTools: detailed, allTools: Object.values(TOOLS) });
  },
);

// POST /api/tools/checkout
router.post(
  "/tools/checkout",
  authRequired,
  rbacMiddleware.checkPermission("execute_ar"),
  (req, res) => {
    const { toolId, faultId } = req.body || {};
    const tool = TOOLS[toolId];
    if (!tool) return res.status(404).json({ error: "Tool not found" });
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

    toolHistory.push({
      id:        crypto.randomUUID(),
      toolId,
      toolName:  tool.name,
      action:    "CHECKOUT",
      user:      req.user.username,
      faultId:   faultId || null,
      timestamp: new Date().toISOString(),
    });

    writeJson(SESSION_FILE, activeCheckouts);
    writeJson(HISTORY_FILE, toolHistory);
    res.json({ success: true, checkout: entry });
  },
);

// POST /api/tools/checkin
router.post(
  "/tools/checkin",
  authRequired,
  rbacMiddleware.checkPermission("execute_ar"),
  (req, res) => {
    const { toolId } = req.body || {};
    const idx = activeCheckouts.findIndex((t) => t.toolId === toolId);
    if (idx === -1) return res.status(404).json({ error: "Tool not checked out" });

    const [checkout] = activeCheckouts.splice(idx, 1);
    const tool = TOOLS[toolId];

    toolHistory.push({
      id:        crypto.randomUUID(),
      toolId,
      toolName:  tool ? tool.name : toolId,
      action:    "CHECKIN",
      user:      req.user.username,
      faultId:   checkout.faultId || null,
      timestamp: new Date().toISOString(),
    });

    writeJson(SESSION_FILE, activeCheckouts);
    writeJson(HISTORY_FILE, toolHistory);
    res.json({ success: true });
  },
);

// GET /api/tools/history — last 100 events, newest first
router.get(
  "/tools/history",
  authRequired,
  rbacMiddleware.checkPermission("read_ar"),
  (req, res) => {
    toolHistory = readJson(HISTORY_FILE, toolHistory);
    res.json({ history: toolHistory.slice(-100).reverse() });
  },
);

module.exports = router;
