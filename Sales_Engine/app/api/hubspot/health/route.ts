import { NextResponse } from "next/server";
import { hubspotAutoSync, hubspotConfigured, hubspotHealth } from "@/lib/hubspot";

export const runtime = "nodejs";
// Reports live connection status; never prerender.
export const dynamic = "force-dynamic";

/** GET /api/hubspot/health — { configured, connected, autoSync, error? } */
export async function GET() {
  if (!hubspotConfigured()) return NextResponse.json({ configured: false, connected: false, autoSync: false });
  try {
    await hubspotHealth();
    return NextResponse.json({ configured: true, connected: true, autoSync: hubspotAutoSync() });
  } catch (error) {
    return NextResponse.json({
      configured: true,
      connected: false,
      autoSync: hubspotAutoSync(),
      error: error instanceof Error ? error.message : "HubSpot unavailable",
    });
  }
}
