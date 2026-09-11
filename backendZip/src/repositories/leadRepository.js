const fs = require('fs');
const path = require('path');

/**
 * Smallest viable file-backed lead store for the Sales Engine backend.
 * Isolated in this repository module so it can later be replaced by a real
 * database without touching services or routes.
 * The store is NEVER seeded — it only contains leads actually returned by the
 * configured providers (search/enrich), keyed by their normalized id.
 */

const DATA_DIR = process.env.LEADS_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'leads.json');

function readAll() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Missing or malformed store file → empty store, never throw.
    return [];
  }
}

function writeAll(leads) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(leads, null, 2)}\n`, 'utf8');
}

const keyOf = (id) => String(id);

/**
 * Insert or update leads. Existing leads keep their pipeline status so a
 * re-discovery never resets a status set via PATCH /leads/:id/status.
 * Returns the stored leads.
 */
function upsertMany(leads) {
  if (!Array.isArray(leads) || leads.length === 0) return [];

  const all = readAll();
  const index = new Map(all.map((lead) => [keyOf(lead.id), lead]));
  const stored = [];

  for (const lead of leads) {
    if (!lead || lead.id === undefined || lead.id === null || lead.id === '') continue;
    const key = keyOf(lead.id);
    const existing = index.get(key);
    if (existing) {
      // Refresh lead fields, keep the existing pipeline status.
      const merged = { ...lead, id: existing.id, status: existing.status };
      index.set(key, merged);
      stored.push(merged);
    } else {
      const created = { ...lead, id: key, status: 'NEW' };
      index.set(key, created);
      stored.push(created);
    }
  }

  writeAll(Array.from(index.values()));
  return stored;
}

function findById(id) {
  return readAll().find((lead) => keyOf(lead.id) === keyOf(id)) || null;
}

/**
 * Update the pipeline status of one lead. Returns the updated lead, or null
 * when the lead does not exist (the service maps that to 404).
 */
function updateStatus(id, status) {
  const all = readAll();
  const lead = all.find((item) => keyOf(item.id) === keyOf(id));
  if (!lead) return null;

  lead.status = status;
  lead.updatedAt = new Date().toISOString();
  writeAll(all);
  return lead;
}

module.exports = { upsertMany, findById, updateStatus };
