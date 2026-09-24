import { NextResponse } from "next/server";
import { findBusinessContact } from "@/lib/apollo";
import { autoSyncLeads } from "@/lib/hubspotSync";
import { getProject, getProjectRoles } from "@/lib/projects";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/leads/:id/find-contact { phone?, project? } — fallback for a
 * scraped business without contact details: find a decision-maker there on
 * Apollo (the project's target roles first), with their work email and,
 * when `phone`, their mobile number. 1 credit (+ up to 8 for a mobile).
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid lead id." }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { phone?: boolean; project?: string };

  const result = await findBusinessContact(id, {
    phone: body.phone === true,
    roles: getProjectRoles(getProject(body.project)),
  });
  if (result instanceof NextResponse) return result;
  if (result.found) await autoSyncLeads([id]);
  return NextResponse.json(result);
}
