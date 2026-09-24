import { NextResponse } from "next/server";
import { callBackend, postToBackend } from "@/lib/providerBackend";
import type { PeopleSearchParams, PeopleSearchResult } from "@/lib/people";

export const runtime = "nodejs";

/**
 * POST /api/people/search — start finding the people at a business.
 * Returns a job id immediately; poll GET /api/people/search/:jobId.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<PeopleSearchParams>;
  const business = typeof body.business === "string" ? body.business.trim() : "";
  if (!business) {
    return NextResponse.json({ error: 'Enter a business name, e.g. "Taj Exotica Resort & Spa".' }, { status: 400 });
  }

  const result = await callBackend<PeopleSearchResult>(() =>
    postToBackend("/api/people/search", {
      business,
      location: typeof body.location === "string" ? body.location.trim() : "",
      roles: Array.isArray(body.roles) ? body.roles.filter((r) => typeof r === "string") : [],
    })
  );
  if (result instanceof NextResponse) return result;
  return NextResponse.json({ jobId: result.jobId, done: false }, { status: 202 });
}
