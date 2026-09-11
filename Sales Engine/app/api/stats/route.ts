import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const all = await prisma.lead.findMany({ select: { status: true } } );
    const counts: Record<string, number> = {
      PENDING: 0,
      SCRAPED: 0,
      PERSONALIZED:  0,
      SYNCED:  0,
    };
    for (const l of all) {
      const key = l.status as string;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return NextResponse.json({
      total: all.length,
      pending: counts.PENDING ??  0,
      scraped: counts.SCRAPED ??  0,
      personalized: counts.PERSONALIZED ??  0,
      synced: counts.SYNCED ??  0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stats failed" },
      { status:  500 }
    );
  }
}