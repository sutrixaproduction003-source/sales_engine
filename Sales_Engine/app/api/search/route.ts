import { NextResponse } from "next/server";
import { DuplicateLeadError, transaction } from "@/lib/leadDb";
import type { SearchProvider } from "@/lib/searchProviders";
import { API_PROVIDERS } from "@/lib/searchProviders";
import { postToBackend } from "@/lib/providerBackend";
import { cleanString, toLeadDetails, type ProviderLead } from "@/lib/leadRecord";

export const runtime = "nodejs";

/**
 * Unified search API for providers whose results come back into the app
 * (see API_PROVIDERS). Link-based providers such as Sales Navigator are
 * handled entirely in the browser and never reach this route.
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

type SearchResultItem = ProviderLead & { name?: string; website?: string; company?: string };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchBody;
    const { provider, filters, page = 1 } = body;

    if (!provider || !API_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        {
          error: `Invalid provider. Available: ${API_PROVIDERS.join(", ")}`,
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
      case "apollo":
        providerResponse = await postToBackend("/api/leads/search", {
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
        });
        break;

      default:
        return NextResponse.json({ error: "Provider not supported" }, { status: 400 });
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
    const items: SearchResultItem[] = data.data?.items || [];

    let saved = 0;
    try {
      saved = await transaction((tx) => {
        let count = 0;
        for (const item of items) {
          const email = cleanString(item.email);
          if (!email) continue;
          try {
            tx.create({
              ...toLeadDetails(item),
              name: cleanString(item.fullName ?? item.name) || email.split("@")[0],
              email,
              website: cleanString(item.companyWebsite ?? item.website),
              company: cleanString(item.companyName ?? item.company) || null,
              source: cleanString(item.source) || provider,
              status: "PENDING",
            });
            count++;
          } catch (error) {
            if (!(error instanceof DuplicateLeadError)) throw error;
          }
        }
        return count;
      });
    } catch (error) {
      console.error("Failed to save search results:", error);
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
