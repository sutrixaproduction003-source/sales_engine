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

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractReviewData(text: string) {
  const ratingMatch = text.match(
    /(?:rated?\s*)?\b([0-5](?:\.\d)?)\s*(?:\/\s*5|out\s+of\s+5|stars?)\b/i
  );
  const reviewsMatch = text.match(/([\d,.]+)\s*(?:google\s+)?reviews?\b/i);
  const reviewCount = reviewsMatch
    ? Number(reviewsMatch[1].replace(/,/g, ""))
    : null;

  return {
    rating: ratingMatch ? Number(ratingMatch[1]) : null,
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,
  };
}

export async function POST(request: Request) {
  try {
    const { company, location } = (await request.json()) as ReviewSearchBody;
    if (!company?.trim()) {
      return NextResponse.json({ error: "Company is required" }, { status: 400 });
    }

    try {
      const apifyResult = await fetchApifyRating(company.trim(), location?.trim() || "");
      if (apifyResult && (apifyResult.rating !== null || apifyResult.reviewCount !== null)) {
        return NextResponse.json(apifyResult);
      }
    } catch (error) {
      console.warn("Apify Google rating lookup failed:", error);
    }

    const query = `site:google.com/maps "${company.trim()}" "${location?.trim() || ""}" reviews`;
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 SalesEngine/1.0",
          Accept: "text/html",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return NextResponse.json({ rating: null, reviewCount: null, link: null });
    }

    const html = await response.text();
    const titleMatch = html.match(
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );
    const snippetMatch = html.match(
      /<(?:a|div)[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i
    );
    const fallbackLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${company.trim()} ${location?.trim() || ""}`.trim()
    )}`;
    const link = titleMatch?.[1] || fallbackLink;
    const title = titleMatch ? decodeHtml(titleMatch[2]) : "";
    const snippet = snippetMatch ? decodeHtml(snippetMatch[1]) : "";
    const reviewData = extractReviewData(`${title} ${snippet}`);

    return NextResponse.json({
      ...reviewData,
      link,
      snippet: snippet || null,
      source: "DuckDuckGo",
    });
  } catch (error) {
    console.error("Review lookup error:", error);
    return NextResponse.json(
      { error: "Review lookup failed", rating: null, reviewCount: null, link: null },
      { status: 200 }
    );
  }
}