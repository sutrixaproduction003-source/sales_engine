import { NextResponse } from "next/server";
import { revealLead } from "@/lib/apollo";
import { autoSyncLeads } from "@/lib/hubspotSync";
import { getLead } from "@/lib/leadDb";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/leads/:id/find-phone — ask Apollo for the person's mobile number
 * (also fills in a missing work email). Apollo delivers numbers after a short
 * wait: the lead is marked phoneStatus "pending" until POST /api/leads/phones
 * collects it. Up to 1 + 8 Apollo credits.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const lead = Number.isInteger(id) ? await getLead(id) : null;
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (lead.phoneStatus === "pending" || (lead.phoneStatus === "found" && lead.phone)) {
    return NextResponse.json({ phoneStatus: lead.phoneStatus, phone: lead.phone, email: lead.email, already: true });
  }

  const result = await revealLead(id, { phone: true });
  if (result instanceof NextResponse) return result;
  if (result.email !== lead.email || result.phone !== lead.phone) await autoSyncLeads([id]);
  return NextResponse.json(result);
}
