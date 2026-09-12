import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { omniRoutePersonalize } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration =  60;

export async function POST() {
  try {
    const leads = await prisma.lead.findMany({
      where: { status: "SCRAPED" },
      take: 50,
    });

    let personalized =  0;
    const errors: string[] = [];

    // Keep concurrency bounded to avoid overwhelming Groq while preventing one
    // failed lead from delaying every other lead in the queue.
    const concurrency = 5;
    for (let offset = 0; offset < leads.length; offset += concurrency) {
      const batch = leads.slice(offset, offset + concurrency);
      const results = await Promise.allSettled(
        batch.map(async (lead) => {
          const icebreaker = await omniRoutePersonalize(lead.scrapedContext ?? "");
          await prisma.lead.update({
            where: { id: lead.id },
            data: { icebreaker, status: "PERSONALIZED" },
          });
        })
      );

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          personalized++;
        } else {
          const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
          errors.push(batch[index].email + ": " + reason);
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
      { status:  500 }
    );
  }
}