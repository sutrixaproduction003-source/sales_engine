import { NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/leadDb";
import { callBackend, postToBackend } from "@/lib/providerBackend";
import { autoSyncLeads } from "@/lib/hubspotSync";

export const runtime = "nodejs";
export const maxDuration = 60;

interface EnrichResult {
  matched?: boolean;
  lead?: { email?: string; emailStatus?: string; phone?: string; linkedinUrl?: string; jobTitle?: string };
}

/**
 * POST /api/leads/:id/find-email — look up a person's work email with Apollo
 * (by name + company domain, or LinkedIn URL) and save it on the lead.
 * Uses one Apollo enrichment credit per lookup.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const lead = Number.isInteger(id) ? await getLead(id) : null;
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (lead.email) return NextResponse.json({ found: true, email: lead.email, already: true });

  const [firstName, ...rest] = lead.name.trim().split(/\s+/);
  const lastName = rest.join(" ");
  if (!lead.linkedinUrl && !(firstName && lastName && lead.website)) {
    return NextResponse.json(
      { error: "Needs the person's full name and company website (or a LinkedIn URL) to look up an email." },
      { status: 422 }
    );
  }

  const result = await callBackend<EnrichResult>(() =>
    postToBackend("/api/leads/enrich", {
      provider: "apollo",
      firstName,
      lastName,
      companyWebsite: lead.website || undefined,
      linkedinUrl: lead.linkedinUrl || undefined,
    })
  );
  if (result instanceof NextResponse) return result;

  const found = result.lead;
  if (!result.matched || !found?.email) {
    return NextResponse.json({ found: false });
  }

  await updateLead(id, {
    email: found.email,
    phone: lead.phone || found.phone || null,
    linkedinUrl: lead.linkedinUrl || found.linkedinUrl || null,
  });
  await autoSyncLeads([id]);
  return NextResponse.json({ found: true, email: found.email, verified: found.emailStatus === "verified" });
}
