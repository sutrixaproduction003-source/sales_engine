import { NextResponse } from "next/server";
import { postToBackend } from "@/lib/providerBackend";

export const runtime = "nodejs";

interface ReviewSearchBody {
  company?: string;
  location?: string;
}

async function fetchApifyRating(company: string, location: string) {
  const placeUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${company} ${location}`.trim())}`;
  const response = await postToBackend("/api/scrapers", {
    type: "googleMapsReviews",
    placeUrl,
    maxReviews: 50,
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { items?: Array<Record<string, unknown>> };
  const items = payload.items ?? [];
  const item = items[0];
  if (!item) return null;

  const rating = Number(item.totalScore ?? item.rating ?? item.stars ?? item.ratingValue);
  const reviewCount = Number(
    item.reviewsCount ?? item.reviewCount ?? item.numberOfReviews ?? item.reviews
  );
  return {
    rating: Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : null,
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,
    link: String(item.googleMapsUrl ?? item.url ?? "") || null,
    snippet: String(item.description ?? item.address ?? "") || null,
    source: "Apify Google Places",
  };
}

export async function POST(request: Request) {
  try {
    const { company, location } = (await request.json()) as ReviewSearchBody;
    if (!company?.trim()) {
      return NextResponse.json({ error: "Company is required" }, { status: 400 });
    }

    const result = await fetchApifyRating(company.trim(), location?.trim() || "");
    return NextResponse.json(result ?? { rating: null, reviewCount: null, link: null });
  } catch (error) {
    console.error("Review lookup error:", error);
    return NextResponse.json(
      { error: "Review lookup failed", rating: null, reviewCount: null, link: null },
      { status: 200 }
    );
  }
}