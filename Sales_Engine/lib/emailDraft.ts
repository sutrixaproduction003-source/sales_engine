/**
 * Personalized first-touch email drafts. Server-side only.
 *
 * Uses DeepSeek or Groq (OpenAI-compatible chat APIs) when a key is set in
 * Settings; otherwise falls back to a template built from the lead's real
 * data, so the pipeline works without any AI key. Drafts are never sent
 * automatically — they wait for human review.
 */

import { getSetting } from "@/lib/appSettings";
import type { Lead } from "@/lib/leadModel";

export interface EmailDraft {
  subject: string;
  body: string;
  /** First line of the body, kept for the legacy icebreaker column. */
  icebreaker: string;
  method: "ai" | "template";
}

interface Sender {
  name: string;
  company: string;
  pitch: string;
}

function getSender(): Sender {
  return {
    name: getSetting("SENDER_NAME"),
    company: getSetting("SENDER_COMPANY"),
    pitch: getSetting("SENDER_PITCH"),
  };
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

function signature(sender: Sender) {
  return ["Best regards,", sender.name, sender.company].filter(Boolean).join("\n");
}

function businessName(lead: Lead) {
  return lead.company || lead.hotelName || lead.name;
}

/** First name of the contact when the lead is a person (not just a business). */
function contactFirstName(lead: Lead): string | null {
  if (!lead.name || lead.name === businessName(lead) || !lead.jobTitle) return null;
  return lead.name.split(/\s+/)[0] || null;
}

/** What we know about the business, as plain facts for the prompt. */
function leadFacts(lead: Lead): string {
  return [
    `Business: ${businessName(lead)}`,
    lead.industry && `Category: ${lead.industry}`,
    (lead.city || lead.location) && `Location: ${[lead.city, lead.state].filter(Boolean).join(", ") || lead.location}`,
    typeof lead.googleRating === "number" &&
      `Google rating: ${lead.googleRating} from ${lead.totalReviewsCount ?? "?"} reviews`,
    lead.website && `Website: ${lead.website}`,
    contactFirstName(lead) && `Contact: ${lead.name}`,
    lead.jobTitle && `Contact role: ${lead.jobTitle}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function templateDraft(lead: Lead, sender: Sender): EmailDraft {
  const name = businessName(lead);
  const place = lead.city || lead.location;
  const opener =
    typeof lead.googleRating === "number" && lead.totalReviewsCount
      ? `I came across ${name}${place ? ` in ${place}` : ""} on Google Maps — a ${lead.googleRating.toFixed(1)}★ rating from ${lead.totalReviewsCount.toLocaleString("en-US")} reviews says a lot about the experience you provide.`
      : `I came across ${name}${place ? ` in ${place}` : ""} and wanted to reach out directly.`;
  const pitch =
    sender.pitch ||
    `At ${sender.company || "our company"}, we help businesses like yours grow — I'd love to share a few ideas.`;

  const firstName = contactFirstName(lead);
  const greeting = firstName ? `Hi ${firstName},` : `Hi ${name} team,`;
  const body = [greeting, opener, pitch, "Would you be open to a quick 15-minute call next week?", signature(sender)].join(
    "\n\n"
  );
  return { subject: `Quick idea for ${name}`, body, icebreaker: opener, method: "template" };
}

interface ChatProvider {
  key: string;
  base: string;
  model: string;
}

function chatProviders(): ChatProvider[] {
  const providers: ChatProvider[] = [];
  const deepseek = getSetting("DEEPSEEK_API_KEY");
  if (deepseek) {
    providers.push({
      key: deepseek,
      base: (getSetting("DEEPSEEK_BASE_URL") || "https://api.deepseek.com").replace(/\/$/, ""),
      model: getSetting("DEEPSEEK_MODEL") || "deepseek-chat",
    });
  }
  const groq = getSetting("GROQ_API_KEY");
  if (groq) {
    providers.push({
      key: groq,
      base: (getSetting("GROQ_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
      model: getSetting("GROQ_MODEL") || "llama-3.1-8b-instant",
    });
  }
  return providers;
}

/** Parse `{"subject": "...", "body": "..."}`, tolerating code fences. */
function parseDraftJson(content: string): { subject: string; body: string } | null {
  const json = content.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { subject?: unknown; body?: unknown };
    const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    return subject && body ? { subject, body } : null;
  } catch {
    return null;
  }
}

async function aiDraft(lead: Lead, sender: Sender, providers: ChatProvider[]): Promise<EmailDraft> {
  const system = [
    "You write short, genuine first-touch B2B sales emails.",
    "Plain text only. 70-120 words. No markdown, no emojis, no placeholders like [Name].",
    "Open with one specific, true observation about the business, grounded ONLY in the facts and website text given — never invent details.",
    "Then connect it to the sender's offer in one or two sentences, and end with a low-pressure question about a short call.",
    `Greet the contact by first name ("Hi <first name>,") when a contact is given, otherwise "Hi <business> team,". End with this exact signature:\n${signature(sender)}`,
    'Subject: under 8 words, specific, not clickbait. Respond ONLY with JSON: {"subject":"...","body":"..."}',
  ].join(" ");

  const prompt = [
    "Facts about the business:",
    leadFacts(lead),
    lead.scrapedContext ? `Website text:\n${clip(lead.scrapedContext, 6000)}` : "Website text: (not available)",
    "Sender:",
    `Name: ${sender.name || "(not set)"}\nCompany: ${sender.company || "(not set)"}\nOffer: ${sender.pitch || "(not set — keep the offer general)"}`,
  ].join("\n\n");

  let lastError = "The AI returned no usable draft.";
  for (const provider of providers) {
    try {
      const response = await fetch(`${provider.base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.6,
          max_tokens: 500,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(45000),
      });
      const data = (await response.json().catch(() => ({}))) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string };
      };
      if (!response.ok) {
        lastError = data.error?.message || `AI request failed (${response.status}).`;
        continue;
      }
      const draft = parseDraftJson(data.choices?.[0]?.message?.content ?? "");
      if (draft) {
        const firstLine = draft.body.split(/\n+/).find((line) => line.trim() && !/^hi\b/i.test(line.trim())) ?? "";
        return { ...draft, icebreaker: firstLine.trim(), method: "ai" };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError);
}

/**
 * Draft an email for a lead. Falls back to the template when no AI key is
 * configured or every AI provider fails (the reason is returned as `warning`).
 */
export async function draftEmail(lead: Lead): Promise<EmailDraft & { warning?: string }> {
  const sender = getSender();
  const profileWarning =
    sender.name && sender.pitch
      ? undefined
      : "Your sender profile (name and what you offer) is not set in Settings — the draft uses generic wording. Set it, then Redraft.";

  const providers = chatProviders();
  if (providers.length === 0) return { ...templateDraft(lead, sender), warning: profileWarning };

  try {
    return { ...(await aiDraft(lead, sender, providers)), warning: profileWarning };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ...templateDraft(lead, sender), warning: `AI drafting failed, used the template instead: ${reason}` };
  }
}
