import { NextResponse } from "next/server";
import { listLeads } from "@/lib/leadDb";
import { draftLead } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Leads handled per request; the client calls again until `remaining` is 0. */
const BATCH_SIZE = 5;

/**
 * POST /api/personalize — draft emails for leads that have an email but no
 * draft yet (PENDING/SCRAPED). Drafts go to the Review Queue; nothing is sent.
 */
export async function POST() {
  try {
    const queue = await listLeads({
      where: (lead) => Boolean(lead.email) && (lead.status === "PENDING" || lead.status === "SCRAPED"),
    });
    const batch = queue.slice(0, BATCH_SIZE);

    let personalized = 0;
    const errors: string[] = [];
    for (const lead of batch) {
      try {
        const outcome = await draftLead(lead.id);
        if (outcome.ok) personalized++;
        else errors.push(`${lead.name}: ${outcome.reason}`);
      } catch (err) {
        errors.push(`${lead.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      personalized,
      pending: batch.length,
      remaining: Math.max(0, queue.length - batch.length),
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Personalize failed" }, { status: 500 });
  }
}
