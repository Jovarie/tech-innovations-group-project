// src/routes/faultRoutes.js
const express = require("express");
const { FAULTS } = require("../models/fault");
const { authRequired } = require("../middleware/auth");
const rbacMiddleware = require("../middleware/rbacMiddleware");

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

// GET /api/health
router.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

module.exports = router;