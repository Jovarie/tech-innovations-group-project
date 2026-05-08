const express = require("express");
const { PORT } = require("../src/config");
const configureGlobalMiddleware = require("../src/middleware/global");

const authRoutes    = require("../src/routes/authRoutes");
const faultRoutes   = require("../src/routes/faultRoutes");
const toolRoutes    = require("../src/routes/toolRoutes");
const recordsRoutes = require("../src/routes/records");
const spaRoutes     = require("../src/routes/spaRoutes");

const app = express();

configureGlobalMiddleware(app);

app.use("/api", authRoutes);
app.use("/api", faultRoutes);
app.use("/api", toolRoutes);
app.use("/api", recordsRoutes);
app.use("/", spaRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong on the server" });
});

module.exports = app;
