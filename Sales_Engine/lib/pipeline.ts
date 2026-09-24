/**
 * Outreach pipeline steps for one lead. Server-side only.
 *
 *   PENDING → (read website) SCRAPED → (draft email) PERSONALIZED
 *   PERSONALIZED → human review → SYNCED (sent) or REJECTED
 *
 * Nothing here sends email: sending only happens from the review gate
 * (POST /api/leads/:id/send).
 */

import { getLead, updateLead } from "@/lib/leadDb";
import type { Lead } from "@/lib/leadModel";
import { draftEmail } from "@/lib/emailDraft";
import { apifyScrape } from "@/lib/providers";

const MIN_USEFUL_TEXT = 200;
const MAX_CONTEXT = 15000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read a business website's text: a direct fetch first (free and fast), then
 * the Apify crawler for sites that need a browser. Returns "" when neither works.
 */
export async function readWebsite(website: string): Promise<string> {
  const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; SalesEngine/1.0)" },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (response.ok) {
      const text = stripHtml(await response.text());
      if (text.length >= MIN_USEFUL_TEXT) return text.slice(0, MAX_CONTEXT);
    }
  } catch {
    // Fall through to Apify.
  }
  try {
    return (await apifyScrape(url)).slice(0, MAX_CONTEXT);
  } catch {
    return "";
  }
}

export type DraftOutcome =
  | { ok: true; lead: Lead; warning?: string }
  | { ok: false; lead: Lead | null; reason: string };

/**
 * Prepare one lead for review: read its website (once) and draft the email.
 * Leads without an email are skipped — there is nobody to send to.
 * `force` re-drafts a lead that already has a draft.
 */
export async function draftLead(id: number, { force = false } = {}): Promise<DraftOutcome> {
  let lead = await getLead(id);
  if (!lead) return { ok: false, lead: null, reason: "Lead not found." };
  if (!lead.email) return { ok: false, lead, reason: "No email address — nothing to send to." };
  if (lead.status === "SYNCED") return { ok: false, lead, reason: "Already sent." };
  if (lead.emailBody && lead.status === "PERSONALIZED" && !force) return { ok: true, lead };

  if (!lead.scrapedContext && lead.website) {
    const context = await readWebsite(lead.website);
    lead = (await updateLead(id, { scrapedContext: context || null, status: "SCRAPED" })) ?? lead;
  }

  const draft = await draftEmail(lead);
  const updated = await updateLead(id, {
    emailSubject: draft.subject,
    emailBody: draft.body,
    icebreaker: draft.icebreaker,
    draftMethod: draft.method,
    status: "PERSONALIZED",
    sendError: draft.warning ?? null,
  });
  return { ok: true, lead: updated ?? lead, warning: draft.warning };
}
