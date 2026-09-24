import { NextResponse } from "next/server";
import { callBackend, getFromBackend } from "@/lib/providerBackend";
import type { PeopleSearchResult } from "@/lib/people";

export const runtime = "nodejs";

/** GET /api/people/search/:jobId?business=…&roles=… — poll a people search. */
export async function GET(request: Request, { params }: { params: { jobId: string } }) {
  const search = new URL(request.url).searchParams;
  const query = new URLSearchParams({ business: search.get("business") ?? "", roles: search.get("roles") ?? "" });

  const result = await callBackend<PeopleSearchResult & { success?: boolean }>(() =>
    getFromBackend(`/api/people/search/${encodeURIComponent(params.jobId)}?${query}`)
  );
  if (result instanceof NextResponse) return result;

  return NextResponse.json({ ...result, success: undefined });
}
