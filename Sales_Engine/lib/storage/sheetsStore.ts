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
import { HEADERS, SHEET_NAME, leadToRow, rowsToLeads } from "./leadColumns";
import { getAccessToken, getServiceAccount } from "./googleAuth";
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

async function sheetsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${API}/${sheetId()}${path}`, {
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

const state = globalThis as unknown as { __sheetsRowCount?: number };

async function read(): Promise<Lead[]> {
  let values: unknown[][];
  try {
    const result = await sheetsRequest<{ values?: unknown[][] }>(
      `/values/${encodeURIComponent(SHEET_NAME)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`
    );
    values = result.values ?? [];
  } catch (error) {
    // No "Leads" tab yet: an empty store (the tab is created on first save).
    if (error instanceof LeadStoreError && /Unable to parse range/i.test(error.message)) return [];
    throw error;
  }
  state.__sheetsRowCount = values.length;
  if (values.length === 0) return [];
  return rowsToLeads(values[0], values.slice(1));
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
  version,
};

export function sheetUrl(): string | null {
  const id = parseSheetId(getSetting("GOOGLE_SHEET_ID"));
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}
