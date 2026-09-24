import { NextResponse } from "next/server";
import { leadPatch, revealPerson, type ApolloPerson } from "@/lib/apollo";
import { autoSyncLeads } from "@/lib/hubspotSync";
import { transaction } from "@/lib/leadDb";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/apollo/save — reveal an Apollo search result (full name, work
 * email, LinkedIn: 1 credit; mobile: up to 8 more when `phone`) and save them
 * as a lead. Saving the same person again updates the existing lead.
 *
 * { person: { id, … }, project, phone } → { lead: { id, name, email, phone, phoneStatus }, created }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { person?: ApolloPerson; project?: string; phone?: boolean };
  const person = body.person;
  if (!person?.id) return NextResponse.json({ error: "An Apollo person id is required." }, { status: 400 });
  const phone = body.phone === true;

  const result = await revealPerson({ id: person.id }, { phone });
  if (result instanceof NextResponse) return result;
  if (!result.matched || !result.lead) {
    return NextResponse.json({ error: "Apollo could not reveal this person." }, { status: 404 });
  }

  const found = result.lead;
  const name = found.fullName || [person.firstName, person.lastName].filter(Boolean).join(" ");
  const base = {
    name,
    company: found.companyName || person.companyName || null,
    location: found.location || null,
    project: getProject(body.project)?.id ?? null,
    source: "apollo",
  };

  try {
    const saved = await transaction((tx) => {
      const existing = tx.find(
        (lead) =>
          lead.apolloId === found.id ||
          Boolean(found.email && lead.email === found.email) ||
          Boolean(found.linkedinUrl && lead.linkedinUrl === found.linkedinUrl)
      );
      if (existing) {
        const patch = leadPatch(existing, result, { phone });
        const lead = tx.update(existing.id, { ...patch, project: existing.project ?? base.project });
        return { lead: lead ?? existing, created: false };
      }
      const patch = leadPatch({}, result, { phone });
      return { lead: tx.create({ ...base, ...patch, website: patch.website ?? "", status: "PENDING" }), created: true };
    });

    await autoSyncLeads([saved.lead.id]);
    const { id, email, phoneStatus } = saved.lead;
    return NextResponse.json({ lead: { id, name: saved.lead.name, email, phone: saved.lead.phone, phoneStatus }, created: saved.created });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Saving failed." }, { status: 500 });
  }
}
