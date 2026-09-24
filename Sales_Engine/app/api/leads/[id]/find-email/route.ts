import { NextResponse } from "next/server";
import { revealLead } from "@/lib/apollo";
import { autoSyncLeads } from "@/lib/hubspotSync";
import { getLead } from "@/lib/leadDb";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/leads/:id/find-email — look up a person's work email with Apollo
 * (by Apollo id, name + company, or LinkedIn URL) and save it on the lead.
 * Uses one Apollo credit per lookup.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const lead = Number.isInteger(id) ? await getLead(id) : null;
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (lead.email) return NextResponse.json({ found: true, email: lead.email, already: true });

  const result = await revealLead(id);
  if (result instanceof NextResponse) return result;
  if (result.email) await autoSyncLeads([id]);
  return NextResponse.json({ found: Boolean(result.email), email: result.email });
}
