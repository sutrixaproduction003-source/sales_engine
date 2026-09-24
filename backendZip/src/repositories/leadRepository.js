const fs = require('fs');
const path = require('path');
const { leadsDataDir } = require('../config/env');

/**
 * Smallest viable file-backed lead store for the Sales Engine backend.
 * Isolated in this repository module so it can later be replaced by a real
 * database without touching services or routes.
 * The store is NEVER seeded — it only contains leads actually returned by the
 * configured providers (search/enrich), keyed by their normalized id.
 */

const DATA_FILE = path.join(leadsDataDir, 'leads.json');

/** Pipeline statuses accepted by PATCH /leads/:id/status. */
const LEAD_STATUSES = ['NEW', 'ENRICHED', 'VERIFIED', 'CONTACTED', 'QUALIFIED', 'CONVERTED'];

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
  fs.mkdirSync(leadsDataDir, { recursive: true });
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(leads, null, 2)}\n`, 'utf8');
}

const keyOf = (id) => String(id);

/**
 * Insert or update leads. Existing leads keep their pipeline status so a
 * re-discovery never resets a status set via PATCH /leads/:id/status.
 * Returns the stored leads plus how many were new vs already known.
 */
function upsertMany(leads) {
  const result = { leads: [], created: 0, updated: 0 };
  if (!Array.isArray(leads) || leads.length === 0) return result;

  const index = new Map(readAll().map((lead) => [keyOf(lead.id), lead]));

  for (const lead of leads) {
    if (!lead || lead.id === undefined || lead.id === null || lead.id === '') continue;
    const key = keyOf(lead.id);
    const existing = index.get(key);

    const stored = existing
      ? { ...lead, id: existing.id, status: existing.status }
      : { ...lead, id: key, status: 'NEW' };

    index.set(key, stored);
    result.leads.push(stored);
    result[existing ? 'updated' : 'created'] += 1;
  }

  writeAll(Array.from(index.values()));
  return result;
}

function findById(id) {
  return readAll().find((lead) => keyOf(lead.id) === keyOf(id)) || null;
}

/**
 * Update the pipeline status of one lead. Returns the updated lead, or null
 * when the lead does not exist.
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

module.exports = { LEAD_STATUSES, upsertMany, findById, updateStatus };
