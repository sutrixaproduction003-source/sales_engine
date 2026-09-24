import { NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/leadDb";
import { draftLead } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

const parseId = (raw: string) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * POST /api/leads/:id/draft[?force=1] — read the lead's website and draft its
 * email. The lead then waits in the Review Queue; nothing is sent.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: "Invalid lead id." }, { status: 400 });

  try {
    const force = new URL(request.url).searchParams.get("force") === "1";
    const outcome = await draftLead(id, { force });
    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.reason, lead: outcome.lead },
        { status: outcome.lead ? 422 : 404 }
      );
    }
    return NextResponse.json({ success: true, lead: outcome.lead, warning: outcome.warning ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Drafting failed." }, { status: 500 });
  }
}

/**
 * PATCH /api/leads/:id/draft — save a reviewer's edits to the subject/body.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: "Invalid lead id." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { subject?: unknown; body?: unknown };
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!subject || !text) {
    return NextResponse.json({ error: "Subject and body are required." }, { status: 400 });
  }

  try {
    const lead = await getLead(id);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    if (lead.status !== "PERSONALIZED") {
      return NextResponse.json({ error: "Only drafts waiting for review can be edited." }, { status: 409 });
    }
    const updated = await updateLead(id, { emailSubject: subject, emailBody: text });
    return NextResponse.json({ success: true, lead: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Saving failed." }, { status: 500 });
  }
}
