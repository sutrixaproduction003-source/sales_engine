import { NextResponse } from "next/server";
import { listLeads, updateLead } from "@/lib/leadDb";
import { apifyScrape } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const leads = await listLeads({ where: (lead) => lead.status === "PENDING", limit: 50 });

    let scraped = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        const context = await apifyScrape(lead.website);
        await updateLead(lead.id, { scrapedContext: context, status: "SCRAPED" });
        scraped++;
      } catch (err) {
        errors.push((lead.email ?? lead.name) + ": " + (err instanceof Error ? err.message : String(err)));
      }
    }

    return NextResponse.json({
      scraped,
      pending: leads.length,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scrape failed" },
      { status: 500 }
    );
  }
}