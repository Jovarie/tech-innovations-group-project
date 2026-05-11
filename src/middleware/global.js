// src/middleware/global.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const { CORS_ALLOW_ORIGIN, FORCE_HTTPS, TRUST_PROXY } = require("../config");

function configureGlobalMiddleware(app) {
  app.disable("x-powered-by");
  app.set("trust proxy", TRUST_PROXY);

  app.use(helmet({
    contentSecurityPolicy: false,
  }));

  app.use((req, res, next) => {
    if (process.env.NODE_ENV === "production" || FORCE_HTTPS) {
      const proto = req.get("x-forwarded-proto") || req.protocol;
      if (proto !== "https") {
        return res.redirect(301, `https://${req.get("host")}${req.originalUrl}`);
      }
    }
    next();
  });

  // If CORS_ALLOW_ORIGIN env var is set, lock to that origin.
  // Otherwise reflect the request's own origin (safe: same-origin browser requests
  // carry no Origin header, so they're always allowed; JWT secures the API regardless).
  app.use(cors({
    origin: CORS_ALLOW_ORIGIN
      ? CORS_ALLOW_ORIGIN
      : (origin, cb) => cb(null, origin || false),
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
  }));

  app.use(express.json({ limit: "32kb", strict: true }));
  app.use(express.urlencoded({ extended: false, limit: "16kb" }));

  app.use((req, res, next) => {
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), interest-cohort=()");
    next();
  });

  app.use(express.static(path.join(__dirname, "../../public"), {
    setHeaders(res, filePath) {
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  }));
}

module.exports = configureGlobalMiddleware;