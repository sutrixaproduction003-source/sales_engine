import { NextResponse } from "next/server";
import { collectPhones } from "@/lib/apollo";
import { autoSyncLeads } from "@/lib/hubspotSync";
import { listLeads } from "@/lib/leadDb";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/leads/phones { ids } — collect mobile numbers Apollo has finished
 * looking up for these leads (free) and save them.
 * → { results: { [id]: { phoneStatus, phone } }, pending }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger));
  if (!ids.size) return NextResponse.json({ error: "No leads given." }, { status: 400 });

  const leads = (await listLeads()).filter((l) => ids.has(l.id));
  const results = await collectPhones(leads);
  if (results instanceof NextResponse) return results;

  const found = leads.filter((l) => l.phoneStatus === "pending" && results[l.id]?.phoneStatus === "found").map((l) => l.id);
  if (found.length) await autoSyncLeads(found);
  const pending = Object.values(results).filter((r) => r.phoneStatus === "pending").length;
  return NextResponse.json({ results, pending });
}
