// src/config/index.js
require("dotenv").config(); // Optional: supports loading variables from a .env file

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || "your-fallback-super-secret-key",
  TOKEN_TTL: process.env.TOKEN_TTL || "1h",
};