// src/routes/faultRoutes.js
const express = require("express");
const { FAULTS, updateFaultStatus, resetFaults, addNote, reload, ALLOWED_STATUSES } = require("../models/fault");
const { ZONES, RESTRICTED_PERMISSION } = require("../models/zones");
const { authRequired } = require("../middleware/auth");
const rbacMiddleware = require("../middleware/rbacMiddleware");
const Permissions = require("../models/permission");

const router = express.Router();

// GET /api/faults
router.get(
  "/faults",
  authRequired,
  rbacMiddleware.checkPermission("read_ar"),
  (req, res) => {
    reload();
    res.json({ faults: Object.values(FAULTS) });
  },
);

// GET /api/faults/:id
router.get(
  "/faults/:id",
  authRequired,
  rbacMiddleware.checkPermission("read_ar"),
  (req, res) => {
    const fault = FAULTS[req.params.id];
    if (!fault) return res.status(404).json({ error: "Fault not found" });
    res.json(fault);
  },
);

// PATCH /api/faults/:id/status  (INT-01: AR app calls this when a fault is marked Fixed)
router.patch(
  "/faults/:id/status",
  authRequired,
  rbacMiddleware.checkPermission("execute_ar"),
  (req, res) => {
    const { status } = req.body || {};
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` });
    }
    const fault = updateFaultStatus(req.params.id, status);
    if (fault === null) return res.status(404).json({ error: "Fault not found" });
    res.json(fault);
  },
);

// POST /api/faults/:id/notes  (SWE-04: engineer adds a site annotation)
router.post(
  "/faults/:id/notes",
  authRequired,
  rbacMiddleware.checkPermission("execute_ar"),
  (req, res) => {
    const { text, author } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "note text is required" });
    }
    const fault = addNote(req.params.id, text.trim(), (author || "engineer").trim());
    if (fault === null) return res.status(404).json({ error: "Fault not found" });
    res.json(fault);
  },
);

// POST /api/faults/reset  — restore all faults to seed statuses (demo utility)
router.post(
  "/faults/reset",
  authRequired,
  rbacMiddleware.checkPermission("execute_ar"),
  (req, res) => {
    res.json({ faults: Object.values(resetFaults()) });
  },
);

// GET /api/zones  (CYB-03: returns zone list; restricted zones show full detail only to authorised roles)
router.get(
  "/zones",
  authRequired,
  rbacMiddleware.checkPermission("read_ar"),
  (req, res) => {
    const userPerms = new Permissions().getPermissionsByRoleName(req.user.role);
    const zones = Object.values(ZONES).map((z) => {
      const canAccess = z.accessLevel === "standard" || userPerms.includes(RESTRICTED_PERMISSION);
      return {
        id: z.id,
        name: z.name,
        accessLevel: z.accessLevel,
        authorized: canAccess,
        description: canAccess ? z.description : "RESTRICTED: Insufficient clearance level.",
        hazards: canAccess ? z.hazards : null,
        operationalDetail: canAccess ? (z.operationalDetail || null) : null,
      };
    });
    res.json({ zones, role: req.user.role });
  },
);

// GET /api/analytics  — descriptive stats + rule-based priority risk predictions
router.get(
  "/analytics",
  authRequired,
  rbacMiddleware.checkPermission("read_ar"),
  (req, res) => {
    reload();
    const faults = Object.values(FAULTS);
    const now    = Date.now();

    // Resolution time targets in days by priority (rule-based predictive model)
    const TARGET_DAYS = { CRITICAL: 2, HIGH: 5, MEDIUM: 14, LOW: 30 };

    const byStatus   = { OPEN: 0, "IN PROGRESS": 0, FIXED: 0 };
    const byPriority = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const predictions = [];

    faults.forEach((f) => {
      if (byStatus[f.status]   !== undefined) byStatus[f.status]++;
      if (byPriority[f.priority] !== undefined) byPriority[f.priority]++;

      if (f.status !== "FIXED") {
        const ageMs       = now - new Date(f.reportedAt).getTime();
        const ageDays     = ageMs / 86400000;
        const targetDays  = TARGET_DAYS[f.priority] || 14;
        const daysLeft    = Math.max(0, targetDays - ageDays);
        const overdue     = ageDays > targetDays;
        const riskScore   = Math.min(100, Math.round((ageDays / targetDays) * 100));

        predictions.push({
          id:          f.id,
          title:       f.title,
          priority:    f.priority,
          status:      f.status,
          ageDays:     Math.round(ageDays * 10) / 10,
          targetDays,
          daysLeft:    Math.round(daysLeft * 10) / 10,
          overdue,
          riskScore,
        });
      }
    });

    predictions.sort((a, b) => b.riskScore - a.riskScore);

    res.json({
      byStatus,
      byPriority,
      totalNotes:   faults.reduce((n, f) => n + (f.notes ? f.notes.length : 0), 0),
      predictions,
    });
  },
);

// GET /api/health
router.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

module.exports = router;
