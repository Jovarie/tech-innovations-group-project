// src/config/index.js
require("dotenv").config(); // Optional: supports loading variables from a .env file

const JWT_SECRET = process.env.JWT_SECRET || "your-fallback-super-secret-key";
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  console.warn("[WARN] JWT_SECRET is not set — using insecure fallback. Set JWT_SECRET in environment variables.");
}

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET,
  TOKEN_TTL: process.env.TOKEN_TTL || "1h",
  TRUST_PROXY: process.env.TRUST_PROXY === "true",
  CORS_ALLOW_ORIGIN: process.env.CORS_ALLOW_ORIGIN || null,
  FORCE_HTTPS: process.env.FORCE_HTTPS === "true",
};