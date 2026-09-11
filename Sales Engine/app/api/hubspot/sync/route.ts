import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncLeadToHubSpot } from "@/lib/hubspot";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { ids?: number[] };
    const leads = await prisma.lead.findMany({
      where: body.ids?.length ? { id: { in: body.ids } } : { status: "PERSONALIZED" },
      take: 50,
    });
    let synced = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        const ids = await syncLeadToHubSpot(lead);
        await prisma.lead.update({ where: { id: lead.id }, data: { hubspotContactId: ids.contactId, hubspotCompanyId: ids.companyId, hubspotSyncStatus: "SYNCED", hubspotSyncedAt: new Date(), hubspotSyncError: null } });
        synced++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${lead.email}: ${message}`);
        await prisma.lead.update({ where: { id: lead.id }, data: { hubspotSyncStatus: "ERROR", hubspotSyncError: message.slice(0, 500) } });
      }
    }
    return NextResponse.json({ synced, attempted: leads.length, errors: errors.slice(0, 20) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "HubSpot sync failed" }, { status: 500 });
  }
}