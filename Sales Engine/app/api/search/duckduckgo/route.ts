import { NextResponse } from "next/server";
import type { SearchFilters, SearchResult } from "@/lib/searchProviders";

export const runtime = "nodejs";

/**
 * DuckDuckGo OSINT Search - Free lead discovery via search engine
 * Builds advanced search queries to find business contacts
 */

interface DuckDuckGoSearchBody {
  filters: SearchFilters;
  page?: number;
}

interface DuckDuckGoResult {
  title: string;
  description: string;
  url: string;
}

function buildDuckDuckGoQuery(filters: SearchFilters): string {
  const parts: string[] = [];

  if (filters.keywords) {
    parts.push(`"${filters.keywords}"`);
  }

  if (filters.location) {
    parts.push(`"${filters.location}"`);
  }

  if (filters.industry) {
    parts.push(`"${filters.industry}"`);
  }

  if (filters.jobTitle) {
    parts.push(`("${filters.jobTitle}" OR "${filters.jobTitle} director" OR "${filters.jobTitle} manager")`);
  }

  if (filters.company) {
    parts.push(`site:${filters.company.replace(/\s+/g, "")}.com`);
  }

  // Add email finding pattern
  parts.push('("@gmail.com" OR "@yahoo.com" OR "@company.com" OR "mailto:")');

  return parts.join(" ");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DuckDuckGoSearchBody;
    const { filters, page = 1 } = body;

    if (!filters) {
      return NextResponse.json(
        { error: "Missing filters parameter" },
        { status: 400 }
      );
    }

    const query = buildDuckDuckGoQuery(filters);

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

    if (!response.ok) throw new Error("Search provider unreachable");
    
    const html = await response.text();
    const results: SearchResult[] = Array.from(html.matchAll(
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
    )).map((m, i) => ({
      id: `ddg-${page}-${i}`,
      name: m[2].replace(/<[^>]+>/g, "").trim(),
      company: filters.company || "Unknown Company",
      website: m[1],
      source: "DuckDuckGo OSINT"
    }));

    return NextResponse.json({
      success: true,
      query,
      data: {
        items: results,
        page,
        hasMore: results.length > 0,
      },
    });
  } catch (error) {
    console.error("DuckDuckGo search error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "DuckDuckGo search failed",
      },
      { status: 500 }
    );
  }
}


