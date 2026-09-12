import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { instantlyPush } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const leads = await prisma.lead.findMany({
      where: { status: "PERSONALIZED" },
      take: 50,
    });

    let synced =  0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        await instantlyPush(lead);
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: "SYNCED" },
        });
        synced++;
      } catch (err) {
        errors.push(lead.email + ": " + (err instanceof Error ? err.message : String(err)));
      }
    }

    return NextResponse.json({
      synced,
      pending: leads.length,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Push failed" },
      { status:  500 }
    );
  }
}