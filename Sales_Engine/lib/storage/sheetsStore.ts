/**
 * Lead store: a Google Sheet (tab "Leads"), through the Sheets API v4 with a
 * service account. Works on any host. The sheet must be shared with the
 * service account's email as an Editor.
 *
 * Google allows ~60 write requests a minute per user, so each save is a
 * single request and rate-limit responses are retried with backoff.
 */

import { getSetting } from "@/lib/appSettings";
import type { Lead } from "@/lib/leadModel";
import { HEADERS, SHEET_NAME, cellText, leadToRow, mapRows } from "./leadColumns";
import { getAccessToken, getServiceAccount } from "./googleAuth";
import { createHash } from "crypto";
import { LeadStoreError, type LeadStoreDriver } from "./types";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
/** External edits in the sheet are picked up within this window. */
const CACHE_WINDOW_MS = 15_000;

/** Accepts a sheet id or a full "docs.google.com/spreadsheets/d/<id>/…" URL. */
export function parseSheetId(value: string): string {
  const trimmed = value.trim();
  return trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? trimmed;
}

function sheetId(): string {
  const id = parseSheetId(getSetting("GOOGLE_SHEET_ID"));
  if (!id) throw new LeadStoreError("Google Sheets is not set up: add the Sheet link in Settings.", "config");
  return id;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sheetsRequest<T>(path: string, init: RequestInit = {}, spreadsheetId = sheetId()): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${API}/${spreadsheetId}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    if (response.ok) return (await response.json()) as T;

    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    const message = body.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 403 || response.status === 404) {
      const email = getServiceAccount()?.client_email ?? "the service account";
      throw new LeadStoreError(
        `Can't open the Google Sheet (${message}). Check the link and share the sheet with ${email} as an Editor.`,
        "access"
      );
    }
    throw new LeadStoreError(`Google Sheets error: ${message}`, "api");
  }
}

/** Make sure the "Leads" tab exists, with a frozen header row. */
async function ensureTab(): Promise<void> {
  const meta = await sheetsRequest<{ sheets?: { properties: { title: string } }[] }>("?fields=sheets.properties.title");
  if (meta.sheets?.some((s) => s.properties.title === SHEET_NAME)) return;
  await sheetsRequest(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: SHEET_NAME, gridProperties: { frozenRowCount: 1 } } } }],
    }),
  });
}

/** What the last read saw: where each lead's row is, so saves touch only those rows. */
interface SheetLayout {
  /** Header cells as they are in the sheet (people may reorder or add columns). */
  header: string[];
  /** Lead id → sheet row number (1-based; row 1 is the header). */
  rowOf: Map<number, number>;
  /** Lead id → the row's cells as read (kept for columns the app doesn't know). */
  cells: Map<number, unknown[]>;
  /** Leads whose id cell was missing or duplicated: written with their new id on the next save. */
  unsavedIds: Set<number>;
  /** Rows in use, including the header. */
  rowCount: number;
}

const state = globalThis as unknown as {
  __sheetsRowCount?: number;
  __sheetsFingerprint?: string | null;
  __sheetsLayout?: SheetLayout | null;
};

const hash = (values: unknown[][]) => createHash("sha256").update(JSON.stringify(values)).digest("hex");

async function readValues(): Promise<unknown[][]> {
  try {
    const result = await sheetsRequest<{ values?: unknown[][] }>(
      `/values/${encodeURIComponent(SHEET_NAME)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`
    );
    return result.values ?? [];
  } catch (error) {
    if (error instanceof LeadStoreError && /Unable to parse range/i.test(error.message)) return [];
    throw error;
  }
}

/** Hash of the Leads tab as it is right now. */
async function fingerprint(): Promise<string> {
  return hash(await readValues());
}

async function read(): Promise<Lead[]> {
  // No "Leads" tab yet reads as an empty store (the tab is created on first save).
  const values = await readValues();
  state.__sheetsRowCount = values.length;
  state.__sheetsFingerprint = hash(values);
  const header = (values[0] ?? []).map((cell) => cellText(cell) ?? "");
  const layout: SheetLayout = { header, rowOf: new Map(), cells: new Map(), unsavedIds: new Set(), rowCount: values.length };
  state.__sheetsLayout = layout;
  if (values.length === 0) return [];

  const rows = values.slice(1);
  const { leads, rowIndex, idAssigned } = mapRows(values[0], rows);
  leads.forEach((lead, i) => {
    layout.rowOf.set(lead.id, rowIndex[i] + 2);
    layout.cells.set(lead.id, rows[rowIndex[i]]);
    if (idAssigned[i]) layout.unsavedIds.add(lead.id);
  });
  return leads;
}

/**
 * Save only the rows of these leads (and the header when columns are
 * missing), in the sheet's own column order. Rows nobody changed are never
 * rewritten, so edits made in the sheet meanwhile are kept. Needs the layout
 * of a read() just before — which transactions always do.
 */
async function writeRows(leads: Lead[], changedIds: Set<number>): Promise<void> {
  const layout = state.__sheetsLayout;
  if (!layout) return write(leads);
  await ensureTab();

  const header = [...layout.header];
  for (const key of HEADERS) if (!header.includes(key)) header.push(key);
  const data: { range: string; values: unknown[][] }[] = [];
  if (header.length !== layout.header.length || header.some((h, i) => h !== layout.header[i])) {
    data.push({ range: `${SHEET_NAME}!A1`, values: [header] });
  }

  const byId = new Map(leads.map((lead) => [lead.id, lead]));
  let nextRow = Math.max(layout.rowCount, 1) + 1;
  const ids = Array.from(new Set(Array.from(changedIds).concat(Array.from(layout.unsavedIds))));
  for (const id of ids) {
    const lead = byId.get(id);
    if (!lead) continue;
    const known = leadToRow(lead, { datesAsText: true });
    const previous = layout.cells.get(id) ?? [];
    const row = header.map((h) => {
      const at = (HEADERS as string[]).indexOf(h);
      if (at >= 0) return known[at] ?? "";
      // A column someone added by hand: keep its value.
      const oldAt = layout.header.indexOf(h);
      return oldAt >= 0 ? previous[oldAt] ?? "" : "";
    });
    const sheetRow = layout.rowOf.get(id) ?? nextRow++;
    layout.rowOf.set(id, sheetRow);
    data.push({ range: `${SHEET_NAME}!A${sheetRow}`, values: [row] });
  }
  if (!data.length) return;

  await sheetsRequest("/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
  layout.header = header;
  layout.unsavedIds.clear();
  layout.rowCount = Math.max(layout.rowCount, nextRow - 1);
  state.__sheetsRowCount = layout.rowCount;
  state.__sheetsFingerprint = null;
}

async function write(leads: Lead[]): Promise<void> {
  await ensureTab();
  const rows = [HEADERS as unknown[], ...leads.map((lead) => leadToRow(lead, { datesAsText: true }))];
  // Blank out rows left over from a longer previous table.
  const previous = state.__sheetsRowCount ?? 0;
  for (let i = rows.length; i < previous; i++) rows.push(HEADERS.map(() => ""));

  await sheetsRequest(`/values/${encodeURIComponent(`${SHEET_NAME}!A1`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: rows }),
  });
  state.__sheetsRowCount = leads.length + 1;
  state.__sheetsFingerprint = null;
  state.__sheetsLayout = null;
}

/** Time bucket: the sheet is re-read at most every CACHE_WINDOW_MS. */
async function version(): Promise<string> {
  return `${sheetId()}:${Math.floor(Date.now() / CACHE_WINDOW_MS)}`;
}

export const sheetsStore: LeadStoreDriver = {
  id: "sheets",
  label: "Google Sheets",
  read,
  write,
  writeRows,
  version,
  fingerprint,
  lastReadFingerprint: () => state.__sheetsFingerprint ?? null,
};

/**
 * Write rows into a new tab of a spreadsheet (the connected sheet by default,
 * or any sheet shared with the service account). Returns a link to the tab.
 */
export async function writeNewTab(title: string, rows: unknown[][], sheetLink?: string): Promise<string> {
  const spreadsheetId = sheetLink ? parseSheetId(sheetLink) : sheetId();
  const added = await sheetsRequest<{ replies: { addSheet: { properties: { sheetId: number } } }[] }>(
    ":batchUpdate",
    {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }],
      }),
    },
    spreadsheetId
  );
  const tabId = added.replies[0].addSheet.properties.sheetId;

  await sheetsRequest(
    `/values/${encodeURIComponent(`'${title.replace(/'/g, "''")}'!A1`)}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values: rows.map((row) => row.map((v) => (v === null || v === undefined ? "" : v))) }) },
    spreadsheetId
  );
  // Bold header row.
  await sheetsRequest(
    ":batchUpdate",
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId: tabId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
        ],
      }),
    },
    spreadsheetId
  );
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${tabId}`;
}

export function sheetUrl(): string | null {
  const id = parseSheetId(getSetting("GOOGLE_SHEET_ID"));
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}
