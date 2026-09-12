import { NextResponse } from "next/server";
import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scoreLead } from "@/lib/scoring";

export const runtime = "nodejs";

/**
 * POST /api/leads/{id}/score
 *
 * Score a lead based on its data (name, title, company, context, industry).
 * Updates the lead record with: businessType, classification, decisionMakerTier,
 * relevanceScore, intentScore, buyingPowerScore, intentSignals.
 *
 * Returns the updated lead with all scoring fields.
 */
async function handleBatchScore(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  try {
    // Fetch leads to score
    const leads = await prisma.lead.findMany({
      where: status ? { status: status as LeadStatus } : {},
    });

    if (leads.length === 0) {
      return NextResponse.json({
        success: true,
        scored: 0,
        message: "No leads to score",
      });
    }

    // Score and update each lead
    let scored = 0;
    for (const lead of leads) {
      const scoring = scoreLead({
        name: lead.name,
        jobTitle: lead.jobTitle ?? undefined,
        company: lead.company ?? undefined,
        scrapedContext: lead.scrapedContext ?? undefined,
        industry: lead.industry ?? undefined,
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          businessType: scoring.businessType,
          classification: scoring.classification,
          decisionMakerTier: scoring.decisionMakerTier,
          relevanceScore: scoring.relevanceScore,
          intentScore: scoring.intentScore,
          buyingPowerScore: scoring.buyingPowerScore,
          intentSignals: JSON.stringify(scoring.intentSignals),
        },
      });

      scored++;
    }

    return NextResponse.json({
      success: true,
      scored,
      message: `Scored ${scored} leads`,
    });
  } catch (err) {
    console.error("Batch scoring error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Batch scoring failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);

  if (url.pathname.includes("/batch-score")) {
    return handleBatchScore(request);
  }

  const pathId = url.pathname.match(/\/leads\/(?:score\/)?(\d+)(?:\/score)?\/?$/)?.[1];
  const id = parseInt(url.searchParams.get("id") ?? pathId ?? "", 10);

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
  }

  try {
    // Fetch the lead
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Score the lead
    const scoring = scoreLead({
      name: lead.name,
      jobTitle: lead.jobTitle ?? undefined,
      company: lead.company ?? undefined,
      scrapedContext: lead.scrapedContext ?? undefined,
      industry: lead.industry ?? undefined,
    });

    // Update the lead with scoring data
    const updated = await prisma.lead.update({
      where: { id },
      data: {
        businessType: scoring.businessType,
        classification: scoring.classification,
        decisionMakerTier: scoring.decisionMakerTier,
        relevanceScore: scoring.relevanceScore,
        intentScore: scoring.intentScore,
        buyingPowerScore: scoring.buyingPowerScore,
        intentSignals: JSON.stringify(scoring.intentSignals),
      },
    });

    return NextResponse.json({
      success: true,
      lead: updated,
      scoring,
    });
  } catch (err) {
    console.error("Scoring error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scoring failed" },
      { status: 500 }
    );
  }
}
