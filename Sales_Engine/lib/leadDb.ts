/**
 * Lead storage in a local Excel workbook (default: data/leads.xlsx, override
 * with LEADS_XLSX_PATH). Server-side only.
 *
 * - The workbook is the source of truth: open it in Excel at any time. Edits
 *   made there (while the app is not writing) are picked up on the next read.
 * - Writes are serialized within the server process and written atomically
 *   (temp file + rename), so a crash never leaves a half-written workbook.
 * - Excel locks files it has open on Windows; saving then fails with a
 *   LeadStoreBusyError asking the user to close the file.
 *
 * Needs a persistent disk: it will not keep data on serverless hosts such as
 * Netlify or Vercel.
 */

import { promises as fs } from "fs";
import path from "path";
import ExcelJS from "exceljs";
import {
  LeadStatus,
  type Lead,
  type LeadInput,
  type LeadUpdate,
} from "@/lib/leadModel";

const FILE_PATH = process.env.LEADS_XLSX_PATH || path.join(process.cwd(), "data", "leads.xlsx");
const SHEET_NAME = "Leads";

type Kind = "string" | "number" | "int" | "date";

/** Column order in the sheet: the fields people read first come first. */
const COLUMNS: { key: keyof Lead; kind: Kind; width: number }[] = [
  { key: "id", kind: "int", width: 6 },
  { key: "status", kind: "string", width: 13 },
  { key: "name", kind: "string", width: 30 },
  { key: "company", kind: "string", width: 26 },
  { key: "email", kind: "string", width: 30 },
  { key: "phone", kind: "string", width: 18 },
  { key: "website", kind: "string", width: 30 },
  { key: "industry", kind: "string", width: 18 },
  { key: "exactAddress", kind: "string", width: 40 },
  { key: "city", kind: "string", width: 14 },
  { key: "state", kind: "string", width: 12 },
  { key: "location", kind: "string", width: 20 },
  { key: "project", kind: "string", width: 12 },
  { key: "source", kind: "string", width: 13 },
  { key: "googleRating", kind: "number", width: 8 },
  { key: "totalReviewsCount", kind: "int", width: 9 },
  { key: "googleMapsLink", kind: "string", width: 30 },
  { key: "latitude", kind: "number", width: 11 },
  { key: "longitude", kind: "number", width: 11 },
  { key: "jobTitle", kind: "string", width: 20 },
  { key: "linkedinUrl", kind: "string", width: 28 },
  { key: "instagramLink", kind: "string", width: 28 },
  { key: "facebookLink", kind: "string", width: 28 },
  { key: "hotelName", kind: "string", width: 24 },
  { key: "brandType", kind: "string", width: 14 },
  { key: "propertySizeCategory", kind: "string", width: 14 },
  { key: "googleBusinessLink", kind: "string", width: 28 },
  { key: "tripAdvisorLink", kind: "string", width: 28 },
  { key: "bookingComLink", kind: "string", width: 28 },
  { key: "makeMyTripLink", kind: "string", width: 28 },
  { key: "sentimentScore", kind: "number", width: 10 },
  { key: "googlePlaceId", kind: "string", width: 30 },
  { key: "businessType", kind: "string", width: 16 },
  { key: "classification", kind: "string", width: 16 },
  { key: "decisionMakerTier", kind: "string", width: 10 },
  { key: "relevanceScore", kind: "int", width: 9 },
  { key: "intentScore", kind: "int", width: 9 },
  { key: "buyingPowerScore", kind: "int", width: 9 },
  { key: "intentSignals", kind: "string", width: 30 },
  { key: "scrapedContext", kind: "string", width: 40 },
  { key: "icebreaker", kind: "string", width: 40 },
  { key: "emailSubject", kind: "string", width: 40 },
  { key: "emailBody", kind: "string", width: 60 },
  { key: "draftMethod", kind: "string", width: 10 },
  { key: "sentAt", kind: "date", width: 20 },
  { key: "sentMessageId", kind: "string", width: 30 },
  { key: "sendError", kind: "string", width: 30 },
  { key: "hubspotContactId", kind: "string", width: 14 },
  { key: "hubspotCompanyId", kind: "string", width: 14 },
  { key: "hubspotSyncStatus", kind: "string", width: 12 },
  { key: "hubspotSyncedAt", kind: "date", width: 20 },
  { key: "hubspotSyncError", kind: "string", width: 30 },
  { key: "createdAt", kind: "date", width: 20 },
  { key: "updatedAt", kind: "date", width: 20 },
];

const STATUSES = Object.values(LeadStatus) as string[];

export class DuplicateLeadError extends Error {
  constructor(message = "A lead with the same email + website or Google place already exists.") {
    super(message);
    this.name = "DuplicateLeadError";
  }
}

export class LeadStoreBusyError extends Error {
  constructor() {
    super(`Could not save leads: ${path.basename(FILE_PATH)} is open in another program (e.g. Excel). Close it and try again.`);
    this.name = "LeadStoreBusyError";
  }
}

// ---------- cell <-> value conversion ----------

function cellText(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return String(value.text);
    if ("result" in value) return value.result === undefined ? null : String(value.result);
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

function fromCell(value: ExcelJS.CellValue, kind: Kind): unknown {
  if (kind === "date") {
    if (value instanceof Date) return value;
    const text = cellText(value);
    const date = text ? new Date(text) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (kind === "number" || kind === "int") {
    const n = typeof value === "number" ? value : Number(cellText(value));
    if (!Number.isFinite(n) || cellText(value) === null) return null;
    return kind === "int" ? Math.round(n) : n;
  }
  return cellText(value);
}

/** Turn a sheet row into a Lead, filling defaults for blank cells. */
function toLead(raw: Record<string, unknown>, fallbackId: number): Lead {
  const now = new Date();
  const status = String(raw.status ?? "").toUpperCase();
  return {
    ...(raw as Partial<Lead>),
    id: typeof raw.id === "number" && raw.id > 0 ? raw.id : fallbackId,
    name: (raw.name as string) ?? "",
    website: (raw.website as string) ?? "",
    status: (STATUSES.includes(status) ? status : LeadStatus.PENDING) as LeadStatus,
    relevanceScore: (raw.relevanceScore as number) ?? 0,
    intentScore: (raw.intentScore as number) ?? 0,
    buyingPowerScore: (raw.buyingPowerScore as number) ?? 0,
    createdAt: (raw.createdAt as Date) ?? now,
    updatedAt: (raw.updatedAt as Date) ?? now,
  } as Lead;
}

// ---------- file I/O ----------

async function readWorkbook(): Promise<Lead[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);
  const sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) return [];

  // Map header text → column number, so reordered/extra columns still work.
  const headerIndex = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const header = cellText(cell.value);
    if (header) headerIndex.set(header, col);
  });

  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: Record<string, unknown> = {};
    for (const column of COLUMNS) {
      const col = headerIndex.get(column.key);
      if (col) raw[column.key] = fromCell(row.getCell(col).value, column.kind);
    }
    if (raw.name || raw.email || raw.website) rows.push(raw);
  });

  // Rows added by hand in Excel may have no (or a duplicate) id: give them fresh ones.
  let nextId = rows.reduce((max, r) => (typeof r.id === "number" && r.id > max ? r.id : max), 0) + 1;
  const seen = new Set<number>();
  return rows.map((raw) => {
    const id = typeof raw.id === "number" && raw.id > 0 && !seen.has(raw.id) ? raw.id : nextId++;
    seen.add(id);
    return toLead({ ...raw, id }, id);
  });
}

async function writeWorkbook(leads: Lead[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sales Engine";
  const sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c) => ({ header: c.key, key: c.key, width: c.width }));
  for (const lead of leads) {
    sheet.addRow(Object.fromEntries(COLUMNS.map((c) => [c.key, lead[c.key] ?? null])));
  }

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  for (const column of COLUMNS) {
    if (column.kind === "date") sheet.getColumn(column.key).numFmt = "yyyy-mm-dd hh:mm";
  }

  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  const temp = `${FILE_PATH}.${process.pid}.tmp`;
  try {
    await workbook.xlsx.writeFile(temp);
    await fs.rename(temp, FILE_PATH);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") throw new LeadStoreBusyError();
    throw error;
  }
}

// ---------- in-process cache + write queue ----------

interface StoreState {
  leads: Lead[] | null;
  mtimeMs: number;
  queue: Promise<unknown>;
}

// Shared across route bundles and hot reloads in the same server process.
const globalStore = globalThis as unknown as { __leadStore?: StoreState };
const state: StoreState = (globalStore.__leadStore ??= { leads: null, mtimeMs: -1, queue: Promise.resolve() });

async function load(): Promise<Lead[]> {
  let mtimeMs: number;
  try {
    mtimeMs = (await fs.stat(FILE_PATH)).mtimeMs;
  } catch {
    state.leads = [];
    state.mtimeMs = -1;
    return state.leads;
  }
  if (!state.leads || mtimeMs !== state.mtimeMs) {
    state.leads = await readWorkbook();
    state.mtimeMs = mtimeMs;
  }
  return state.leads;
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
export function transaction<T>(fn: (tx: LeadTransaction) => T): Promise<T> {
  return serialize(async () => {
    const leads = (await load()).map(clone);
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
      await writeWorkbook(leads);
      state.leads = leads;
      state.mtimeMs = (await fs.stat(FILE_PATH)).mtimeMs;
    }
    return result;
  });
}

export interface ListOptions {
  where?: (lead: Lead) => boolean;
  limit?: number;
  /** Newest first (by createdAt) when true. */
  newestFirst?: boolean;
}

export async function listLeads({ where, limit, newestFirst }: ListOptions = {}): Promise<Lead[]> {
  let leads = (await serialize(load)).filter((lead) => (where ? where(lead) : true));
  if (newestFirst) leads = [...leads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return (limit ? leads.slice(0, limit) : leads).map(clone);
}

export async function getLead(id: number): Promise<Lead | null> {
  const lead = (await serialize(load)).find((l) => l.id === id);
  return lead ? clone(lead) : null;
}

export const createLead = (input: LeadInput) => transaction((tx) => tx.create(input));

export const updateLead = (id: number, patch: LeadUpdate) => transaction((tx) => tx.update(id, patch));

export async function countLeadsByStatus(): Promise<{ total: number } & Record<LeadStatus, number>> {
  const counts = { total: 0, PENDING: 0, SCRAPED: 0, PERSONALIZED: 0, SYNCED: 0, REJECTED: 0 };
  for (const lead of await serialize(load)) {
    counts.total++;
    counts[lead.status]++;
  }
  return counts;
}

/** Absolute path of the workbook (shown in the UI / logs). */
export const LEADS_FILE_PATH = FILE_PATH;
