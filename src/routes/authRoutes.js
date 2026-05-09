// src/routes/authRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const { JWT_SECRET, TOKEN_TTL } = require("../config");
const { USERS } = require("../models/user");
const { validateLoginInput } = require("../middleware/validation");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again in 15 minutes." },
});

router.post("/login", loginLimiter, validateLoginInput, async (req, res, next) => {
  const { username, password } = req.body || {};

  try {
    const user = USERS.find((u) => u.username === username);
    const dummyHash = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8N2u6mB0Wz0V9pH3l4cZJWJZ2C5cju";
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
  } catch (err) {
    next(err);
  }
});

module.exports = router;