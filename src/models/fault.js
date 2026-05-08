const fs   = require("fs");
const path = require("path");

const SEED_FILE   = path.join(__dirname, "../../data/faults.seed.json");
const LOCAL_FILE  = path.join(__dirname, "../../data/faults.json");
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY   = "ar:faults";

// ─── Redis helpers (Upstash REST API — shared across all Vercel instances) ───

async function redisGet(key) {
  const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const { result } = await r.json();
  return result ? JSON.parse(result) : null;
}

async function redisSet(key, value) {
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify([JSON.stringify(value)]),
  });
}

// ─── File fallback (local dev) ───────────────────────────────────────────────

function loadFile() {
  try { return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8")); } catch {}
  return JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
}

function saveFile(faults) {
  try { fs.writeFileSync(LOCAL_FILE, JSON.stringify(faults, null, 2)); } catch {}
}

// ─── Public async API ────────────────────────────────────────────────────────

async function getFaults() {
  if (REDIS_URL) {
    const data = await redisGet(REDIS_KEY);
    if (data) return data;
    // First time — seed Redis from bundled JSON
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
    await redisSet(REDIS_KEY, seed);
    return seed;
  }
  return loadFile();
}

async function putFaults(faults) {
  if (REDIS_URL) {
    await redisSet(REDIS_KEY, faults);
  } else {
    saveFile(faults);
  }
}

const ALLOWED_STATUSES = ["OPEN", "IN PROGRESS", "FIXED"];

async function updateFaultStatus(id, status) {
  const faults = await getFaults();
  if (!faults[id]) return null;
  if (!ALLOWED_STATUSES.includes(status)) return undefined;
  faults[id] = { ...faults[id], status, updatedAt: new Date().toISOString() };
  await putFaults(faults);
  return faults[id];
}

async function resetFaults() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
  await putFaults(seed);
  return seed;
}

async function addNote(id, text, author) {
  const faults = await getFaults();
  if (!faults[id]) return null;
  const note = { text, author, timestamp: new Date().toISOString() };
  faults[id].notes = [...(faults[id].notes || []), note];
  await putFaults(faults);
  return faults[id];
}

module.exports = { getFaults, updateFaultStatus, resetFaults, addNote, ALLOWED_STATUSES };
