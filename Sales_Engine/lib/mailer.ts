/**
 * Outbound email through Gmail SMTP (smtp.gmail.com:465, SSL) with a Google
 * App Password. Server-side only. Credentials come from Settings.
 *
 * Gmail App Passwords need 2-Step Verification on the Google account:
 * https://myaccount.google.com/apppasswords
 */

import nodemailer from "nodemailer";
import { getSetting } from "@/lib/appSettings";

export interface MailConfig {
  user: string;
  fromName: string;
  configured: boolean;
}

export function getMailConfig(): MailConfig {
  const user = getSetting("GMAIL_USER");
  const password = getSetting("GMAIL_APP_PASSWORD");
  return {
    user,
    fromName: getSetting("SENDER_NAME") || user,
    configured: Boolean(user && password),
  };
}

function createTransport() {
  const user = getSetting("GMAIL_USER");
  // App Passwords are shown with spaces ("abcd efgh ijkl mnop"); SMTP wants them without.
  const pass = getSetting("GMAIL_APP_PASSWORD").replace(/\s+/g, "");
  if (!user || !pass) {
    throw new Error("Gmail is not connected. Add your Gmail address and App Password in Settings.");
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

/** Turn nodemailer/Gmail errors into something a user can act on. */
function explain(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string; responseCode?: number })?.code;
  const responseCode = (error as { responseCode?: number })?.responseCode;
  if (code === "EAUTH" || responseCode === 535) {
    return new Error(
      "Gmail rejected the login. Use a Google App Password (not your normal password) with 2-Step Verification enabled."
    );
  }
  if (responseCode === 550 || responseCode === 421) {
    return new Error(`Gmail refused to send (${responseCode}): possibly the daily sending limit. ${message}`);
  }
  return new Error(`Email could not be sent: ${message}`);
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail(email: OutgoingEmail): Promise<{ messageId: string }> {
  const { user, fromName } = getMailConfig();
  try {
    const info = await createTransport().sendMail({
      from: { name: fromName, address: user },
      to: email.to,
      subject: email.subject,
      text: email.text,
    });
    return { messageId: info.messageId };
  } catch (error) {
    throw explain(error);
  }
}

/** Check the Gmail login without sending anything. */
export async function verifyMailConnection(): Promise<void> {
  try {
    await createTransport().verify();
  } catch (error) {
    throw explain(error);
  }
}
