import { NextResponse } from "next/server";
import { updateLead } from "@/lib/leadDb";

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

    const lead = await updateLead(id, { status: body.decision === "approve" ? "SYNCED" : "PENDING" });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, lead });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review decision failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}