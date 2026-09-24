import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callBackend, getFromBackend } from "@/lib/providerBackend";
import { getProject } from "@/lib/projects";
import { isUniqueViolation, toLeadDetails } from "@/lib/leadRecord";
import type { PlacesRun, ScrapedPlace } from "@/lib/places";

export const runtime = "nodejs";

/** Pipeline columns for a scraped business. */
function toLeadData(place: ScrapedPlace, project: string | null) {
  return {
    ...toLeadDetails(place),
    name: place.companyName,
    email: place.email || null,
    website: place.companyWebsite || "",
    googlePlaceId: place.placeId,
    project,
    source: "google_maps",
  };
}

/**
 * Store scraped places, deduplicated by Google place id. Re-scraping refreshes
 * the business details but never resets a lead's pipeline status or project.
 */
async function savePlaces(places: ScrapedPlace[], project: string | null) {
  let saved = 0;
  let updated = 0;
  const stored = new Map<string, { id: number; status: ScrapedPlace["status"] }>();

  for (const place of places) {
    const data = toLeadData(place, project);
    try {
      const existing = place.placeId
        ? await prisma.lead.findUnique({ where: { googlePlaceId: place.placeId } })
        : null;

      const row = existing
        ? await prisma.lead.update({
            where: { id: existing.id },
            data: { ...data, project: existing.project ?? project, email: data.email ?? existing.email },
          })
        : await prisma.lead.create({ data });

      if (existing) updated++;
      else saved++;
      stored.set(place.id, { id: row.id, status: row.status });
    } catch (error) {
      // Same email + website already stored under another place: keep going.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  return { saved, updated, stored };
}

/**
 * GET /api/places/search/:runId?project=… — poll a Google Maps scrape. Once
 * the run is done, results are saved to the pipeline and returned with their
 * pipeline ids. A database failure never hides the scraped results.
 */
export async function GET(request: Request, { params }: { params: { runId: string } }) {
  const result = await callBackend<PlacesRun>(() =>
    getFromBackend(`/api/places/search/${encodeURIComponent(params.runId)}`)
  );
  if (result instanceof NextResponse) return result;

  const run: PlacesRun = {
    runId: result.runId,
    status: result.status,
    done: result.done,
    startedAt: result.startedAt,
    places: result.places ?? [],
  };
  if (!run.done) return NextResponse.json(run);

  const projectId = new URL(request.url).searchParams.get("project");
  const project = getProject(projectId)?.id ?? null;

  try {
    const { saved, updated, stored } = await savePlaces(run.places, project);
    run.saved = saved;
    run.updated = updated;
    run.places = run.places.map((place) => {
      const row = stored.get(place.id);
      return row ? { ...place, dbId: row.id, status: row.status } : place;
    });
  } catch (error) {
    console.error("Failed to save scraped places:", error);
    run.saved = 0;
    run.updated = 0;
    run.saveError = "Leads were found but could not be saved to the pipeline database.";
  }

  return NextResponse.json(run);
}
