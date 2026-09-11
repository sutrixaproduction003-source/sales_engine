import { NextResponse } from "next/server";
import { hubspotConfigured, hubspotHealth } from "@/lib/hubspot";

export const runtime = "nodejs";

export async function GET() {
  if (!hubspotConfigured()) return NextResponse.json({ configured: false, connected: false });
  try {
    await hubspotHealth();
    return NextResponse.json({ configured: true, connected: true });
  } catch (error) {
    return NextResponse.json({ configured: true, connected: false, error: error instanceof Error ? error.message : "HubSpot unavailable" });
  }
}