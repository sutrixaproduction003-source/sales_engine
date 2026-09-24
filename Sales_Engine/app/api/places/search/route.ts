import { NextResponse } from "next/server";
import { callBackend, postToBackend } from "@/lib/providerBackend";
import { getProject, getProjectSearchTerms } from "@/lib/projects";
import type { PlacesRun, StartPlacesSearchParams } from "@/lib/places";

export const runtime = "nodejs";

const PLACES_PER_TERM = 20;

/**
 * POST /api/places/search — start a Google Maps scrape for a project +
 * location. Returns immediately with a run id; poll GET /api/places/search/:runId.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<StartPlacesSearchParams>;

  const location = typeof body.location === "string" ? body.location.trim() : "";
  if (!location) {
    return NextResponse.json({ error: "Enter a location, e.g. \"Goa, India\"." }, { status: 400 });
  }

  const project = getProject(body.project);
  const searchTerms = getProjectSearchTerms(
    project,
    Array.isArray(body.categories) ? body.categories : [],
    typeof body.keyword === "string" ? body.keyword : ""
  );
  if (searchTerms.length === 0) {
    return NextResponse.json(
      { error: "Enter what to look for (e.g. \"hotels\"), or pick a project with target categories." },
      { status: 400 }
    );
  }

  const result = await callBackend<PlacesRun>(() =>
    postToBackend("/api/places/search", { location, searchTerms, maxPlacesPerTerm: PLACES_PER_TERM })
  );
  if (result instanceof NextResponse) return result;

  return NextResponse.json({ runId: result.runId, status: result.status, done: false, places: [] }, { status: 202 });
}
