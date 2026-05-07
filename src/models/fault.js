const fs   = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../../data/faults.json");
const SEED_FILE = path.join(__dirname, "../../data/faults.seed.json");

function load() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function save(faults) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(faults, null, 2));
}

// Live reference — mutated in place so existing imports stay valid
const FAULTS = load();

const ALLOWED_STATUSES = ["OPEN", "IN PROGRESS", "FIXED"];

function updateFaultStatus(id, status) {
  if (!FAULTS[id]) return null;
  if (!ALLOWED_STATUSES.includes(status)) return undefined;
  FAULTS[id] = { ...FAULTS[id], status, updatedAt: new Date().toISOString() };
  save(FAULTS);
  return FAULTS[id];
}

function resetFaults() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
  Object.keys(FAULTS).forEach((k) => delete FAULTS[k]);
  Object.assign(FAULTS, seed);
  save(FAULTS);
  return FAULTS;
}

function addNote(id, text, author) {
  if (!FAULTS[id]) return null;
  const note = { text, author, timestamp: new Date().toISOString() };
  FAULTS[id].notes = [...(FAULTS[id].notes || []), note];
  save(FAULTS);
  return FAULTS[id];
}

module.exports = { FAULTS, updateFaultStatus, resetFaults, addNote, ALLOWED_STATUSES };
