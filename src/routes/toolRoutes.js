const express = require("express");
const crypto  = require("crypto");
const { authRequired } = require("../middleware/auth");
const rbacMiddleware   = require("../middleware/rbacMiddleware");

const router = express.Router();

const TOOLS = {
  "TOOL-WRENCH-01":  { id: "TOOL-WRENCH-01",  name: "Adjustable Wrench", required: true,  type: "hand" },
  "TOOL-MULTI-02":   { id: "TOOL-MULTI-02",   name: "Multimeter",        required: true,  type: "electronic" },
  "TOOL-TORCH-03":   { id: "TOOL-TORCH-03",   name: "Inspection Torch",  required: false, type: "light" },
  "TOOL-THERMAL-04": { id: "TOOL-THERMAL-04", name: "Thermal Camera",    required: true,  type: "electronic" },
};

// In-memory session — resets on server restart (acceptable for TRL-3 demo)
let activeCheckouts = [];
let toolHistory     = [];

// GET /api/tools/session — current checkouts + full tool list
router.get(
  "/tools/session",
  authRequired,
  rbacMiddleware.checkPermission("read_ar"),
  (req, res) => {
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

    res.json({ success: true });
  },
);

// GET /api/tools/history — last 100 events, newest first
router.get(
  "/tools/history",
  authRequired,
  rbacMiddleware.checkPermission("read_ar"),
  (req, res) => {
    res.json({ history: toolHistory.slice(-100).reverse() });
  },
);

module.exports = router;
