/**
 * Location-based lead scraping (Google Maps via the provider backend's Apify
 * integration): project + location → businesses with exact coordinates.
 * Shared types and browser helpers; the server side lives in
 * app/api/places/search.
 */

import { apiCall } from "@/lib/api";
import type { LeadState } from "@/lib/states";

/** A business scraped from Google Maps, as returned by the backend. */
export interface ScrapedPlace {
  id: string;
  placeId: string | null;
  companyName: string;
  industry: string;
  categories: string[];
  /** The search term (e.g. "hotels") that found this place. */
  searchTerm: string | null;
  email: string;
  phone: string;
  companyWebsite: string;
  exactAddress: string;
  location: string;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsLink: string | null;
  googleRating: number | null;
  totalReviewsCount: number | null;
  instagramLink: string | null;
  facebookLink: string | null;
  linkedinUrl: string;
  imageUrl: string | null;
  source: string;
  /** Pipeline DB id once saved. */
  dbId?: number | null;
  status?: LeadState | null;
}

export interface PlacesRun {
  runId: string;
  status: string;
  done: boolean;
  places: ScrapedPlace[];
  startedAt?: string;
  /** Present once done: how many places were stored in the pipeline. */
  saved?: number;
  updated?: number;
  /** Set when results could not be stored (e.g. database unavailable). */
  saveError?: string | null;
}

export interface StartPlacesSearchParams {
  project: string;
  location: string;
  /** Project categories to search for; all of the project's when empty. */
  categories?: string[];
  /** Extra free-text business type, e.g. "boutique hotels". */
  keyword?: string;
}

export function startPlacesSearch(params: StartPlacesSearchParams): Promise<PlacesRun> {
  return apiCall<PlacesRun>("/api/places/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export function pollPlacesSearch(runId: string, project: string): Promise<PlacesRun> {
  const query = new URLSearchParams({ project });
  return apiCall<PlacesRun>(`/api/places/search/${encodeURIComponent(runId)}?${query}`);
}

const CATEGORY_PALETTE = ["#38bdf8", "#f97316", "#a78bfa", "#34d399", "#f472b6", "#facc15", "#60a5fa", "#fb7185"];

/** Category a place is grouped and colored by: the search term that found it. */
export function placeCategory(place: Pick<ScrapedPlace, "searchTerm" | "industry">): string {
  const raw = place.searchTerm || place.industry || "other";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Stable category → color assignment, in order of first appearance. */
export function buildCategoryColors(places: ScrapedPlace[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const place of places) {
    const category = placeCategory(place);
    if (!colors.has(category)) colors.set(category, CATEGORY_PALETTE[colors.size % CATEGORY_PALETTE.length]);
  }
  return colors;
}

export const hasCoordinates =(place: Pick<ScrapedPlace, "latitude" | "longitude">) =>
  typeof place.latitude === "number" &&
  typeof place.longitude === "number" &&
  Number.isFinite(place.latitude) &&
  Number.isFinite(place.longitude);
