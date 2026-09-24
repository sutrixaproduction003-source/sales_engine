import { NextResponse } from "next/server";
import { activeStore, copyLeads, countLeads, LeadStoreError, type LeadStoreId } from "@/lib/leadDb";
import { getServiceAccount } from "@/lib/storage/googleAuth";
import { sheetUrl } from "@/lib/storage/sheetsStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const isStore = (value: unknown): value is LeadStoreId => value === "excel" || value === "sheets";

/** GET /api/storage — which store is active and how Google Sheets is set up. */
export async function GET() {
  return NextResponse.json({
    active: activeStore().id,
    sheetUrl: sheetUrl(),
    serviceAccountEmail: getServiceAccount()?.client_email ?? null,
  });
}

/**
 * POST /api/storage
 *   { action: "test", store }                        → { leads }
 *   { action: "copy", from, to, overwrite? }         → { copied }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    store?: unknown;
    from?: unknown;
    to?: unknown;
    overwrite?: boolean;
  };

  try {
    if (body.action === "test" && isStore(body.store)) {
      return NextResponse.json({ ok: true, leads: await countLeads(body.store) });
    }
    if (body.action === "copy" && isStore(body.from) && isStore(body.to)) {
      const copied = await copyLeads(body.from, body.to, { overwrite: Boolean(body.overwrite) });
      return NextResponse.json({ ok: true, copied });
    }
    return NextResponse.json({ error: "Unknown storage action." }, { status: 400 });
  } catch (error) {
    const status = error instanceof LeadStoreError && error.kind !== "api" ? 400 : 502;
    const needsConfirm = error instanceof LeadStoreError && /confirm to overwrite/.test(error.message);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Storage error.", needsConfirm },
      { status: needsConfirm ? 409 : status }
    );
  }
}
