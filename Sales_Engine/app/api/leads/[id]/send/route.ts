import { NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/leadDb";
import { getMailConfig, sendEmail } from "@/lib/mailer";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/leads/:id/send — the human gate. A reviewer approves the draft
 * (as shown to them, including any edits) and it is sent through Gmail.
 * This is the only route in the app that sends email to a lead.
 *
 * { "subject": "...", "body": "..." }
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid lead id." }, { status: 400 });
  }

  const input = (await request.json().catch(() => ({}))) as { subject?: unknown; body?: unknown };
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!subject || !body) {
    return NextResponse.json({ error: "Subject and body are required." }, { status: 400 });
  }

  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (!lead.email) return NextResponse.json({ error: "This lead has no email address." }, { status: 422 });
  if (lead.status !== "PERSONALIZED") {
    // Guards against double sends (e.g. two tabs) and unreviewed leads.
    return NextResponse.json(
      { error: lead.status === "SYNCED" ? "This email was already sent." : "Only drafts in the Review Queue can be sent." },
      { status: 409 }
    );
  }

  if (!getMailConfig().configured) {
    return NextResponse.json(
      { error: "Gmail is not connected. Add your Gmail address and App Password in Settings." },
      { status: 412 }
    );
  }

  try {
    const { messageId } = await sendEmail({ to: lead.email, subject, text: body });
    const updated = await updateLead(id, {
      emailSubject: subject,
      emailBody: body,
      status: "SYNCED",
      sentAt: new Date(),
      sentMessageId: messageId,
      sendError: null,
    });
    return NextResponse.json({ success: true, lead: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email could not be sent.";
    await updateLead(id, { emailSubject: subject, emailBody: body, sendError: message }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
