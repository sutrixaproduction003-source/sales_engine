import { NextResponse } from "next/server";
import { listLeads, updateLead } from "@/lib/leadDb";
import { omniRoutePersonalize } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const leads = await listLeads({ where: (lead) => lead.status === "SCRAPED", limit: 50 });

    let personalized = 0;
    const errors: string[] = [];

    // Keep concurrency bounded to avoid overwhelming Groq while preventing one
    // failed lead from delaying every other lead in the queue.
    const concurrency = 5;
    for (let offset = 0; offset < leads.length; offset += concurrency) {
      const batch = leads.slice(offset, offset + concurrency);
      const results = await Promise.allSettled(
        batch.map(async (lead) => {
          const icebreaker = await omniRoutePersonalize(lead.scrapedContext ?? "");
          await updateLead(lead.id, { icebreaker, status: "PERSONALIZED" });
        })
      );

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          personalized++;
        } else {
          const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
          errors.push((batch[index].email ?? batch[index].name) + ": " + reason);
        }
      });
    }

    return NextResponse.json({
      personalized,
      pending: leads.length,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Personalize failed" },
      { status: 500 }
    );
  }
}