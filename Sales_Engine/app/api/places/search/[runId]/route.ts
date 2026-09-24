import { NextResponse } from "next/server";
import { DuplicateLeadError, transaction } from "@/lib/leadDb";
import { callBackend, getFromBackend } from "@/lib/providerBackend";
import { getProject } from "@/lib/projects";
import { toLeadDetails } from "@/lib/leadRecord";
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
    source: place.source || "google_maps",
  };
}

/**
 * Store scraped places, deduplicated by place id (Google, or "osm:node/…"). Re-scraping refreshes
 * the business details but never resets a lead's pipeline status or project.
 */
function savePlaces(places: ScrapedPlace[], project: string | null) {
  return transaction((tx) => {
    let saved = 0;
    let updated = 0;
    const stored = new Map<string, { id: number; status: ScrapedPlace["status"]; contact: Partial<ScrapedPlace> }>();

    for (const place of places) {
      const data = toLeadData(place, project);
      const existing = place.placeId ? tx.find((l) => l.googlePlaceId === place.placeId) : undefined;
      try {
        // A decision-maker found with Apollo stays the lead's contact.
        const contact = existing?.apolloId
          ? { name: existing.name, jobTitle: existing.jobTitle, email: existing.email, phone: existing.phone, companyPhone: data.phone || existing.companyPhone }
          : {};
        const row = existing
          ? tx.update(existing.id, { ...data, project: existing.project ?? project, email: data.email ?? existing.email, ...contact })
          : tx.create(data);
        if (!row) continue;
        if (existing) updated++;
        else saved++;
        stored.set(place.id, {
          id: row.id,
          status: row.status,
          contact: row.apolloId
            ? { contactName: row.name, contactTitle: row.jobTitle, email: row.email ?? "", phone: row.phone ?? "", phoneStatus: row.phoneStatus }
            : {},
        });
      } catch (error) {
        // Same email + website already stored under another place: keep going.
        if (!(error instanceof DuplicateLeadError)) throw error;
      }
    }

    return { saved, updated, stored };
  });
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
    source: result.source,
    fallbackReason: result.fallbackReason ?? null,
    places: result.places ?? [],
  };
  // `save=0`: a lookup whose results are attached to existing leads instead.
  const search = new URL(request.url).searchParams;
  if (!run.done || search.get("save") === "0") return NextResponse.json(run);

  const projectId = search.get("project");
  const project = getProject(projectId)?.id ?? null;

  try {
    const { saved, updated, stored } = await savePlaces(run.places, project);
    run.saved = saved;
    run.updated = updated;
    run.places = run.places.map((place) => {
      const row = stored.get(place.id);
      return row ? { ...place, ...row.contact, dbId: row.id, status: row.status } : place;
    });
  } catch (error) {
    console.error("Failed to save scraped places:", error);
    run.saved = 0;
    run.updated = 0;
    run.saveError =
      error instanceof Error && error.name === "LeadStoreError"
        ? error.message
        : "Leads were found but could not be saved to the leads spreadsheet.";
  }

  return NextResponse.json(run);
}
