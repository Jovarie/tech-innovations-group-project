// src/routes/faultRoutes.js
const express = require("express");
const { FAULTS, updateFaultStatus, ALLOWED_STATUSES } = require("../models/fault");
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
        description: canAccess ? z.description : "RESTRICTED — Insufficient clearance level.",
        hazards: canAccess ? z.hazards : null,
        operationalDetail: canAccess ? (z.operationalDetail || null) : null,
      };
    });
    res.json({ zones, role: req.user.role });
  },
);

// GET /api/health
router.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

module.exports = router;
