// src/middleware/global.js
const express = require("express");
const cors = require("cors");
const path = require("path");

function configureGlobalMiddleware(app) {
  app.use(cors());
  app.use(express.json({ limit: "32kb" }));
  
  // Climb up two levels out of 'src/middleware' to reference root/public
  app.use(express.static(path.join(__dirname, "../../public")));
}

module.exports = configureGlobalMiddleware;