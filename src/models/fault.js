// src/models/fault.js
const FAULTS = {
  "FAULT-101": {
    id: "FAULT-101",
    title: "Signal Fault",
    zone: "Track 1",
    distance: "10m",
    direction: "right",
    priority: "HIGH",
    status: "OPEN",
    description:
      "Signalling anomaly detected on Track 1. Aspect controller failing intermittently. Inspect relay cabinet on the right-hand side of the platform.",
    reportedAt: "2026-04-22T08:14:00Z",
  },
  "FAULT-102": {
    id: "FAULT-102",
    title: "Cable Degradation",
    zone: "Service Corridor B",
    distance: "5m",
    direction: "left",
    priority: "MEDIUM",
    status: "IN PROGRESS",
    description:
      "Insulation wear on traction power feeder cable. Visible cracking along 5m section to the left of the inspection door.",
    reportedAt: "2026-04-23T11:02:00Z",
  },
  "FAULT-103": {
    id: "FAULT-103",
    title: "Structural Wear",
    zone: "Tunnel Section B",
    distance: "15m",
    direction: "ahead",
    priority: "CRITICAL",
    status: "OPEN",
    description:
      "Hairline cracking along the tunnel lining 15m straight ahead. Water ingress observed. Schedule structural survey before next service window.",
    reportedAt: "2026-04-24T06:48:00Z",
  },
};

const ALLOWED_STATUSES = ["OPEN", "IN PROGRESS", "FIXED"];

function updateFaultStatus(id, status) {
  if (!FAULTS[id]) return null;
  if (!ALLOWED_STATUSES.includes(status)) return undefined;
  FAULTS[id] = { ...FAULTS[id], status, updatedAt: new Date().toISOString() };
  return FAULTS[id];
}

module.exports = { FAULTS, updateFaultStatus, ALLOWED_STATUSES };