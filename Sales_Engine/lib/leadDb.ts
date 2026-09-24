/**
 * The lead database. Server-side only.
 *
 * Leads live in either a local Excel workbook or a Google Sheet — chosen in
 * Settings (LEAD_STORE = "excel" | "sheets") and switchable at any time. The
 * whole table is read into memory, changed inside a transaction, and written
 * back in one save. Writes are serialized within the server process.
 */

import { getSetting } from "@/lib/appSettings";
import { type Lead, type LeadInput, type LeadStatus, type LeadUpdate } from "@/lib/leadModel";
import { toLead } from "@/lib/storage/leadColumns";
import { excelStore } from "@/lib/storage/excelStore";
import { sheetsStore } from "@/lib/storage/sheetsStore";
import { LeadStoreError, type LeadStoreDriver } from "@/lib/storage/types";

export { LeadStoreError };

export class DuplicateLeadError extends Error {
  constructor(message = "A lead with the same email + website or Google place already exists.") {
    super(message);
    this.name = "DuplicateLeadError";
  }
}

export type LeadStoreId = LeadStoreDriver["id"];

/** The store currently selected in Settings. */
export function activeStore(): LeadStoreDriver {
  return getSetting("LEAD_STORE") === "sheets" ? sheetsStore : excelStore;
}

export function storeById(id: LeadStoreId): LeadStoreDriver {
  return id === "sheets" ? sheetsStore : excelStore;
}

// ---------- in-process cache + write queue ----------

interface StoreState {
  cache: Map<string, { version: string; leads: Lead[] }>;
  queue: Promise<unknown>;
}

// Shared across route bundles and hot reloads in the same server process.
const globalStore = globalThis as unknown as { __leadDb?: StoreState };
const state: StoreState = (globalStore.__leadDb ??= { cache: new Map(), queue: Promise.resolve() });

async function load(driver: LeadStoreDriver): Promise<Lead[]> {
  const version = await driver.version();
  const cached = state.cache.get(driver.id);
  if (cached && cached.version === version) return cached.leads;
  const leads = await driver.read();
  state.cache.set(driver.id, { version, leads });
  return leads;
}

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = state.queue.then(fn);
  state.queue = run.catch(() => undefined);
  return run;
}

// ---------- public API ----------

const clone = (lead: Lead): Lead => ({ ...lead });

function assertUnique(leads: Lead[], candidate: Lead) {
  for (const other of leads) {
    if (other.id === candidate.id) continue;
    if (candidate.googlePlaceId && other.googlePlaceId === candidate.googlePlaceId) throw new DuplicateLeadError();
    if (candidate.email && other.email === candidate.email && other.website === candidate.website) {
      throw new DuplicateLeadError();
    }
  }
}

/** Synchronous operations available inside a transaction. */
export interface LeadTransaction {
  all(): Lead[];
  find(predicate: (lead: Lead) => boolean): Lead | undefined;
  create(input: LeadInput): Lead;
  update(id: number, patch: LeadUpdate): Lead | null;
}

/**
 * Run several reads/writes against one consistent snapshot and save once at
 * the end. Nothing is saved if `fn` throws.
 */
export function transaction<T>(fn: (tx: LeadTransaction) => T, driver: LeadStoreDriver = activeStore()): Promise<T> {
  return serialize(async () => {
    // Stores edited by people too (Google Sheets) are read fresh and checked
    // before saving; if the table changed meanwhile, redo on the new data.
    const guarded = Boolean(driver.fingerprint && driver.lastReadFingerprint);
    for (let attempt = 0; ; attempt++) {
      const outcome = await attemptTransaction(fn, driver, guarded);
      if (outcome.done) return outcome.result;
      if (attempt >= 2) {
        throw new LeadStoreError("The Google Sheet kept changing while saving. Try again in a moment.", "busy");
      }
    }
  });
}

async function attemptTransaction<T>(
  fn: (tx: LeadTransaction) => T,
  driver: LeadStoreDriver,
  guarded: boolean
): Promise<{ done: true; result: T } | { done: false }> {
  {
    const leads = (guarded ? await driver.read() : await load(driver)).map(clone);
    const readAs = guarded ? driver.lastReadFingerprint!() : null;
    let dirty = false;
    let nextId = leads.reduce((max, l) => Math.max(max, l.id), 0) + 1;

    const tx: LeadTransaction = {
      all: () => leads.map(clone),
      find: (predicate) => {
        const found = leads.find(predicate);
        return found && clone(found);
      },
      create: (input) => {
        const now = new Date();
        const lead = toLead({ ...input, id: nextId, createdAt: now, updatedAt: now }, nextId);
        assertUnique(leads, lead);
        leads.push(lead);
        nextId++;
        dirty = true;
        return clone(lead);
      },
      update: (id, patch) => {
        const index = leads.findIndex((l) => l.id === id);
        if (index < 0) return null;
        const updated: Lead = { ...leads[index], ...patch, id, updatedAt: new Date() };
        assertUnique(leads, updated);
        leads[index] = updated;
        dirty = true;
        return clone(updated);
      },
    };

    const result = fn(tx);
    if (dirty) {
      if (guarded && (await driver.fingerprint!()) !== readAs) return { done: false };
      await driver.write(leads);
      state.cache.set(driver.id, { version: await driver.version(), leads });
    }
    return { done: true, result };
  }
}

export interface ListOptions {
  where?: (lead: Lead) => boolean;
  limit?: number;
  /** Newest first (by createdAt) when true. */
  newestFirst?: boolean;
}

const snapshot = () => serialize(() => load(activeStore()));

export async function listLeads({ where, limit, newestFirst }: ListOptions = {}): Promise<Lead[]> {
  let leads = (await snapshot()).filter((lead) => (where ? where(lead) : true));
  if (newestFirst) leads = [...leads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return (limit ? leads.slice(0, limit) : leads).map(clone);
}

export async function getLead(id: number): Promise<Lead | null> {
  const lead = (await snapshot()).find((l) => l.id === id);
  return lead ? clone(lead) : null;
}

export const createLead = (input: LeadInput) => transaction((tx) => tx.create(input));

export const updateLead = (id: number, patch: LeadUpdate) => transaction((tx) => tx.update(id, patch));

export async function countLeadsByStatus(): Promise<{ total: number } & Record<LeadStatus, number>> {
  const counts = { total: 0, PENDING: 0, SCRAPED: 0, PERSONALIZED: 0, SYNCED: 0, REJECTED: 0 };
  for (const lead of await snapshot()) {
    counts.total++;
    counts[lead.status]++;
  }
  return counts;
}

/** Number of leads in a store (for Settings / connection tests). */
export async function countLeads(id: LeadStoreId): Promise<number> {
  return (await serialize(() => load(storeById(id)))).length;
}

/**
 * Copy every lead from one store into another (e.g. Excel → Google Sheets
 * when switching). Refuses to overwrite a store that already has leads
 * unless `overwrite` is set.
 */
export async function copyLeads(from: LeadStoreId, to: LeadStoreId, { overwrite = false } = {}): Promise<number> {
  if (from === to) throw new LeadStoreError("Choose two different stores.", "config");
  return serialize(async () => {
    const source = await load(storeById(from));
    const target = storeById(to);
    const existing = await load(target);
    if (existing.length > 0 && !overwrite) {
      throw new LeadStoreError(
        `The ${target.label} already has ${existing.length} leads. Copying would replace them — confirm to overwrite.`,
        "config"
      );
    }
    await target.write(source);
    state.cache.set(target.id, { version: await target.version(), leads: source.map(clone) });
    return source.length;
  });
}
