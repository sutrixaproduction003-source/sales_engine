import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type ReviewDecision = "approve" | "reject";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid lead id." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { decision?: ReviewDecision };
    if (body.decision !== "approve" && body.decision !== "reject") {
      return NextResponse.json(
        { error: "Decision must be approve or reject." },
        { status: 400 }
      );
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: { status: body.decision === "approve" ? "SYNCED" : "PENDING" },
    });

    return NextResponse.json({ success: true, lead });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review decision failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}