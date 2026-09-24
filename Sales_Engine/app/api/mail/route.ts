import { NextResponse } from "next/server";
import { getMailConfig, sendEmail, verifyMailConnection } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/mail — Gmail connection status (never returns the password). */
export async function GET() {
  const { configured, user, fromName } = getMailConfig();
  return NextResponse.json({ configured, user: configured ? user : null, fromName });
}

/**
 * POST /api/mail — test the Gmail connection: logs in and sends a test email
 * to the connected Gmail address itself.
 */
export async function POST() {
  const { configured, user } = getMailConfig();
  if (!configured) {
    return NextResponse.json({ error: "Add your Gmail address and App Password first." }, { status: 412 });
  }
  try {
    await verifyMailConnection();
    await sendEmail({
      to: user,
      subject: "Sales Engine — Gmail connected",
      text: "This is a test email from Sales Engine. Your Gmail SMTP connection works.",
    });
    return NextResponse.json({ success: true, message: `Test email sent to ${user}.` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gmail test failed." }, { status: 502 });
  }
}
