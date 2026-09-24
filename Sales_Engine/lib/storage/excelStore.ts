/**
 * Lead store: a local Excel workbook (default data/leads.xlsx, override with
 * LEADS_XLSX_PATH). Written atomically (temp file + rename). Needs a
 * persistent disk — not suitable for serverless hosts such as Netlify.
 */

import { promises as fs } from "fs";
import path from "path";
import ExcelJS from "exceljs";
import type { Lead } from "@/lib/leadModel";
import { COLUMNS, SHEET_NAME, leadToRow, rowsToLeads } from "./leadColumns";
import { LeadStoreError, type LeadStoreDriver } from "./types";

export const EXCEL_FILE_PATH = process.env.LEADS_XLSX_PATH || path.join(process.cwd(), "data", "leads.xlsx");

async function read(): Promise<Lead[]> {
  try {
    await fs.access(EXCEL_FILE_PATH);
  } catch {
    return [];
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_FILE_PATH);
  const sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) return [];

  const rows: unknown[][] = [];
  sheet.eachRow((row, rowNumber) => {
    // ExcelJS rows are 1-based arrays; drop the empty slot 0.
    if (rowNumber > 1) rows.push((row.values as unknown[]).slice(1));
  });
  return rowsToLeads((sheet.getRow(1).values as unknown[]).slice(1), rows);
}

async function write(leads: Lead[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sales Engine";
  const sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c) => ({ header: c.key, key: c.key, width: c.width }));
  for (const lead of leads) sheet.addRow(leadToRow(lead));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  for (const column of COLUMNS) {
    if (column.kind === "date") sheet.getColumn(column.key).numFmt = "yyyy-mm-dd hh:mm";
  }

  await fs.mkdir(path.dirname(EXCEL_FILE_PATH), { recursive: true });
  const temp = `${EXCEL_FILE_PATH}.${process.pid}.tmp`;
  try {
    await workbook.xlsx.writeFile(temp);
    await fs.rename(temp, EXCEL_FILE_PATH);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
      throw new LeadStoreError(
        `Could not save leads: ${path.basename(EXCEL_FILE_PATH)} is open in another program (e.g. Excel). Close it and try again.`,
        "busy"
      );
    }
    throw error;
  }
}

/** File modification time; edits made in Excel invalidate the cache. */
async function version(): Promise<string> {
  try {
    return String((await fs.stat(EXCEL_FILE_PATH)).mtimeMs);
  } catch {
    return "missing";
  }
}

export const excelStore: LeadStoreDriver = {
  id: "excel",
  label: "Excel file",
  read,
  write,
  version,
};
