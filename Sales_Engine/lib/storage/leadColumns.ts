/**
 * The lead table layout shared by every lead store (Excel file, Google
 * Sheet): column order, value conversion, and row ⇄ Lead mapping.
 */

import { LeadStatus, type Lead } from "@/lib/leadModel";

export const SHEET_NAME = "Leads";

export type Kind = "string" | "number" | "int" | "date";

/** Column order in the sheet: the fields people read first come first. */
export const COLUMNS: { key: keyof Lead; kind: Kind; width: number }[] = [
  { key: "id", kind: "int", width: 6 },
  { key: "status", kind: "string", width: 13 },
  { key: "name", kind: "string", width: 30 },
  { key: "company", kind: "string", width: 26 },
  { key: "email", kind: "string", width: 30 },
  { key: "phone", kind: "string", width: 18 },
  { key: "phoneStatus", kind: "string", width: 10 },
  { key: "companyPhone", kind: "string", width: 18 },
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
  { key: "apolloId", kind: "string", width: 26 },
  { key: "phoneRequestId", kind: "string", width: 22 },
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

// ---------- cell <-> value conversion ----------

/**
 * A cell value from either store: plain strings/numbers/dates (Google Sheets,
 * simple Excel cells) or Excel's rich text, hyperlink and formula objects.
 */
type RichCell = { richText?: { text: string }[]; text?: unknown; result?: unknown };

export function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const cell = value as RichCell;
    if (Array.isArray(cell.richText)) return cell.richText.map((part) => part.text).join("");
    if ("text" in cell) return String(cell.text);
    if ("result" in cell) return cell.result === undefined ? null : String(cell.result);
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function fromCell(value: unknown, kind: Kind): unknown {
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
export function toLead(raw: Record<string, unknown>, fallbackId: number): Lead {
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

/**
 * Turn a header row + data rows into leads. Columns are matched by header
 * name, so reordered or extra columns still work; rows added by hand without
 * an id (or with a duplicate one) get fresh ids.
 */
export function rowsToLeads(headers: unknown[], rows: unknown[][]): Lead[] {
  const headerIndex = new Map<string, number>();
  headers.forEach((value, index) => {
    const header = cellText(value);
    if (header) headerIndex.set(header, index);
  });

  const raws: Record<string, unknown>[] = [];
  for (const row of rows) {
    const raw: Record<string, unknown> = {};
    for (const column of COLUMNS) {
      const index = headerIndex.get(column.key);
      if (index !== undefined) raw[column.key] = fromCell(row[index] ?? null, column.kind);
    }
    if (raw.name || raw.email || raw.website) raws.push(raw);
  }

  let nextId = raws.reduce((max, r) => (typeof r.id === "number" && r.id > max ? r.id : max), 0) + 1;
  const seen = new Set<number>();
  return raws.map((raw) => {
    const id = typeof raw.id === "number" && raw.id > 0 && !seen.has(raw.id) ? raw.id : nextId++;
    seen.add(id);
    return toLead({ ...raw, id }, id);
  });
}

/** One lead as a row of plain values, in COLUMNS order. */
export function leadToRow(lead: Lead, { datesAsText = false } = {}): unknown[] {
  return COLUMNS.map(({ key, kind }) => {
    const value = lead[key];
    if (value === null || value === undefined) return datesAsText ? "" : null;
    if (kind === "date" && value instanceof Date) return datesAsText ? value.toISOString() : value;
    return value;
  });
}

export const HEADERS = COLUMNS.map((c) => c.key);
