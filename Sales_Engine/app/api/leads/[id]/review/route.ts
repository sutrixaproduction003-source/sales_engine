import { NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/leadDb";

export const runtime = "nodejs";

/**
 * PATCH /api/leads/:id/review — reject a draft in human review. Rejected
 * leads are never sent. (Approving happens through POST /api/leads/:id/send,
 * which sends the approved email.)
 *
 * { "decision": "reject" }
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid lead id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { decision?: string };
  if (body.decision !== "reject") {
    return NextResponse.json(
      { error: 'Decision must be "reject". To approve, use Approve & send (POST /api/leads/:id/send).' },
      { status: 400 }
    );
  }

  try {
    const lead = await getLead(id);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    if (lead.status !== "PERSONALIZED") {
      return NextResponse.json({ error: "Only drafts waiting for review can be rejected." }, { status: 409 });
    }
    const updated = await updateLead(id, { status: "REJECTED" });
    return NextResponse.json({ success: true, lead: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review decision failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
