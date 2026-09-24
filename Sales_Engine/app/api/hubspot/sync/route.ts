import { NextResponse } from "next/server";
import { listLeads, updateLead } from "@/lib/leadDb";
import { syncLeadToHubSpot } from "@/lib/hubspot";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { ids?: number[] };
    const ids = new Set(body.ids ?? []);
    const leads = await listLeads({
      where: (lead) => (ids.size ? ids.has(lead.id) : lead.status === "PERSONALIZED" && Boolean(lead.email)),
      limit: 50,
    });
    let synced = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        const hubspot = await syncLeadToHubSpot(lead);
        await updateLead(lead.id, { hubspotContactId: hubspot.contactId, hubspotCompanyId: hubspot.companyId, hubspotSyncStatus: "SYNCED", hubspotSyncedAt: new Date(), hubspotSyncError: null });
        synced++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${lead.email ?? lead.name}: ${message}`);
        await updateLead(lead.id, { hubspotSyncStatus: "ERROR", hubspotSyncError: message.slice(0, 500) });
      }
    }
    return NextResponse.json({ synced, attempted: leads.length, errors: errors.slice(0, 20) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "HubSpot sync failed" }, { status: 500 });
  }
}