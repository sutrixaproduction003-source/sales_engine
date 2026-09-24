import { NextResponse } from "next/server";
import { callBackend, postToBackend } from "@/lib/providerBackend";
import type { PlacesRun } from "@/lib/places";

export const runtime = "nodejs";

/**
 * POST /api/places/lookup — { queries: ["Lucas TVS Ltd, Chennai", …] }
 * Looks up specific businesses on Google Maps (one place each). Poll with
 * GET /api/places/search/:runId?save=0.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { queries?: unknown };
  const queries = Array.isArray(body.queries) ? body.queries.filter((q) => typeof q === "string" && q.trim()) : [];
  if (queries.length === 0) {
    return NextResponse.json({ error: "Nothing to look up." }, { status: 400 });
  }

  const result = await callBackend<PlacesRun>(() => postToBackend("/api/places/lookup", { queries }));
  if (result instanceof NextResponse) return result;
  return NextResponse.json({ runId: result.runId, status: result.status, done: false, places: [], source: result.source, fallbackReason: result.fallbackReason ?? null }, { status: 202 });
}
