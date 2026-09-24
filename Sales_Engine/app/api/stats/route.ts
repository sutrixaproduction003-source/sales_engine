import { NextResponse } from "next/server";
import { countLeadsByStatus } from "@/lib/leadDb";

export const runtime = "nodejs";
// Reads the leads spreadsheet on every request; never prerender.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const counts = await countLeadsByStatus();
    return NextResponse.json({
      total: counts.total,
      pending: counts.PENDING,
      scraped: counts.SCRAPED,
      personalized: counts.PERSONALIZED,
      synced: counts.SYNCED,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stats failed" },
      { status: 500 }
    );
  }
}
