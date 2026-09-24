import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { listLeads, LeadStoreError } from "@/lib/leadDb";
import { EXPORT_COLUMNS, exportRows } from "@/lib/leadExport";
import { writeNewTab } from "@/lib/storage/sheetsStore";

export const runtime = "nodejs";
export const maxDuration = 60;

const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

/**
 * POST /api/leads/export — { format: "xlsx" | "sheets", ids?: number[], sheetLink? }
 * Exports the given leads (all leads when ids is omitted):
 *  - xlsx   → downloads an Excel file
 *  - sheets → writes a new tab in the connected Google Sheet (or `sheetLink`)
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { format?: string; ids?: number[]; sheetLink?: string };
  const ids = Array.isArray(body.ids) ? new Set(body.ids) : null;
  const leads = await listLeads({ where: (lead) => !ids || ids.has(lead.id), newestFirst: true });
  if (leads.length === 0) return NextResponse.json({ error: "No leads to export." }, { status: 400 });
  const rows = exportRows(leads);

  if (body.format === "sheets") {
    try {
      const url = await writeNewTab(`Leads export ${stamp()}`, rows, body.sheetLink?.trim() || undefined);
      return NextResponse.json({ ok: true, url, exported: leads.length });
    } catch (error) {
      const status = error instanceof LeadStoreError && error.kind !== "api" ? 400 : 502;
      return NextResponse.json({ error: error instanceof Error ? error.message : "Google Sheets export failed." }, { status });
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sales Engine";
  const sheet = workbook.addWorksheet("Leads", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  for (const row of rows.slice(1)) sheet.addRow(row);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leads_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
