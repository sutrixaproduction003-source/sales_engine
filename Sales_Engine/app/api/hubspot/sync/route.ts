import { NextResponse } from "next/server";
import { listLeads } from "@/lib/leadDb";
import { hubspotConfigured } from "@/lib/hubspot";
import { needsHubSpotSync, syncLeads } from "@/lib/hubspotSync";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Leads per request — keeps each call well inside time and rate limits. */
const BATCH = 15;

/**
 * POST /api/hubspot/sync — { ids?: number[] }
 * Syncs the given leads, or every lead that is new or changed since its last
 * sync. Handles a batch per call; repeat while `remaining` > 0.
 */
export async function POST(request: Request) {
  if (!hubspotConfigured()) {
    return NextResponse.json({ error: "HubSpot is not connected. Add a private app token in Settings." }, { status: 412 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as { ids?: number[] };
    const ids = new Set(Array.isArray(body.ids) ? body.ids : []);
    const queue = await listLeads({ where: (lead) => (ids.size ? ids.has(lead.id) && needsHubSpotSync(lead) : needsHubSpotSync(lead)) });
    const batch = queue.slice(0, BATCH);

    const result = await syncLeads(batch);
    return NextResponse.json({ ...result, attempted: batch.length, remaining: queue.length - batch.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "HubSpot sync failed" }, { status: 500 });
  }
}
