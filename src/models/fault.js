const fs   = require("fs");
const path = require("path");

const SEED_FILE = path.join(__dirname, "../../data/faults.seed.json");
// /tmp is writable on Vercel serverless; project data dir is read-only
const DATA_FILE = process.env.VERCEL
  ? "/tmp/faults.json"
  : path.join(__dirname, "../../data/faults.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
  }
}

function save(faults) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(faults, null, 2)); } catch { /* ignore */ }
}

// Live reference — mutated in place so existing imports stay valid
const FAULTS = load();

// Re-sync FAULTS from disk (call at the start of read routes so /tmp writes are reflected)
function reload() {
  const fresh = load();
  Object.keys(FAULTS).forEach((k) => delete FAULTS[k]);
  Object.assign(FAULTS, fresh);
}

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

module.exports = { FAULTS, updateFaultStatus, resetFaults, addNote, reload, ALLOWED_STATUSES };
