import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SearchProvider } from "@/lib/searchProviders";
import { AVAILABLE_PROVIDERS } from "@/lib/searchProviders";

export const runtime = "nodejs";

/**
 * Unified search API - routes to different providers
 * Supports: Apollo, Hunter, DuckDuckGo, Prospeo
 */

interface SearchBody {
  provider: SearchProvider;
  filters: {
    location?: string;
    industry?: string;
    keywords?: string;
    jobTitle?: string;
    company?: string;
    hotelName?: string;
    brandType?: string;
    propertySizeCategory?: string;
  };
  page?: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchBody;
    const { provider, filters, page = 1 } = body;

    if (!provider || !AVAILABLE_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        {
          error: `Invalid provider. Available: ${AVAILABLE_PROVIDERS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!filters) {
      return NextResponse.json(
        { error: "Missing filters parameter" },
        { status: 400 }
      );
    }

    // Route to appropriate provider
    let providerResponse: Response;

    switch (provider) {
      case "duckduckgo":
        providerResponse = await fetch(
          `${process.env.VERCEL_URL ? "https://" : "http://localhost:3000"}/api/search/duckduckgo`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filters, page }),
          }
        );
        break;

      case "apollo":
      case "hunter":
      case "prospeo":
        // Route to backend provider service
        const backendUrl = process.env.LEAD_BACKEND_URL || "http://localhost:5000";
        providerResponse = await fetch(`${backendUrl}/api/leads/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            filters: {
              location: filters.location,
              industry: filters.industry,
              job_title: filters.jobTitle,
              keywords: filters.keywords,
              company: filters.company,
              hotel_name: filters.hotelName,
              brand_type: filters.brandType,
              property_size_category: filters.propertySizeCategory,
            },
            page,
          }),
        });
        break;

      default:
        return NextResponse.json(
          { error: "Provider not supported" },
          { status: 400 }
        );
    }

    if (!providerResponse.ok) {
      const error = await providerResponse.text();
      console.error(`Provider ${provider} error:`, error);
      return NextResponse.json(
        {
          error: `Search via ${provider} failed: ${providerResponse.statusText}`,
        },
        { status: providerResponse.status }
      );
    }

    const data = await providerResponse.json();
    const items = data.data?.items || [];

    let saved = 0;
    for (const item of items) {
      const email = (item.email ?? "").trim();
      if (!email) continue;
      try {
        await prisma.lead.create({
          data: {
            name: (item.fullName ?? item.name ?? "").trim() || email.split("@")[0],
            email,
            website: (item.companyWebsite ?? item.website ?? "").trim(),
            company: (item.companyName ?? item.company ?? "").trim() || null,
            status: "PENDING",
          },
        });
        saved++;
      } catch {}
    }

    return NextResponse.json({ ...data, saved });
  } catch (error) {
    console.error("Unified search error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Search request failed",
      },
      { status: 500 }
    );
  }
}
