// src/server.js
const express = require("express");
const { PORT } = require("./src/config");
const configureGlobalMiddleware = require("./src/middleware/global");

// Route Imports
const authRoutes   = require("./src/routes/authRoutes");
const faultRoutes  = require("./src/routes/faultRoutes");
const toolRoutes   = require("./src/routes/toolRoutes");
const recordsRoutes = require("./src/routes/records");
const spaRoutes    = require("./src/routes/spaRoutes");

const app = express();

// 1. Mount Parser, Cors, and Public Static Directory
configureGlobalMiddleware(app);

// 2. Mount Routers
// This prefixes both sets of endpoints with /api, matching your original setup!
app.use("/api", authRoutes);    // yields POST /api/login
app.use("/api", faultRoutes);  // yields GET /api/faults, /api/faults/:id, /api/health
app.use("/api", toolRoutes);   // yields GET/POST /api/tools/*
app.use("/api", recordsRoutes); // yields GET /api/records

// 3. Mount Frontend SPA Catch-All (Keep this last)
app.use("/", spaRoutes); // yields GET /

// 4. Global fallback error handler
app.use((err, req, res, next) => {
  console.error("Internal Error caught:", err.stack);
  res.status(500).json({ error: "Something went wrong on the server" });
});

// 5. Start the server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`AR Maintenance server running on http://localhost:${PORT}`);
});