import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { postToBackend } from "@/lib/providerBackend";
import {
  isUniqueViolation,
  toLeadDetails,
  toNumber,
  type ProviderLead,
} from "@/lib/leadRecord";
import { getProject, getProjectProvider, mergeProjectFilters } from "@/lib/projects";
import { GEOCODE_MAX_PER_REQUEST, geocodeEnabled, geocodeLocation } from "@/lib/geocode";
import {
  leadMatchesCategories,
  type SearchCategoryId,
} from "@/lib/categorySearch";

export const runtime = "nodejs";

/**
 * Lead discovery BFF — connects the frontend to the EXISTING provider backend
 * (backendZip: POST /api/leads/search → Apollo provider service) and
 * persists the normalized results into the Sales Engine pipeline (Prisma).
 * Deduplication is owned by the database unique constraint (email + website).
 * No provider API keys exist in this (or any) frontend file.
 *
 * Fully project-agnostic: the selected project's requirements come from the
 * project registry (lib/projects) and are merged with the user's filters;
 * locations without provider coordinates are geocoded via lib/geocode.
 * No project-specific branches exist anywhere in this route.
 */

interface DiscoverBody {
  project?: string;
  /** Optional provider override; must be supported by the backend providerFactory. */
  provider?: string;
  filters?: {
    location?: string;
    industry?: string;
    categories?: string[];
    job_title?: string;
  };
  page?: number;
}

export async function POST(request: Request) {
  let body: DiscoverBody = {};
  try {
    body = (await request.json()) as DiscoverBody;
  } catch {
    // defaults below
  }

  // Combine the selected project's requirements (project registry) with the
  // user's location/industry/category/job-title selections into the filters
  // documented by the provider backend (API.md): location, industry, job_title.
  // Unknown or absent project ids simply contribute no requirements.
  const raw = body.filters ?? {};
  const projectConfig = getProject(body.project);
  const filters = mergeProjectFilters(projectConfig, {
    location: raw.location,
    industry: raw.industry,
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    job_title: raw.job_title,
  });

  const page = typeof body.page === "number" && body.page > 0 ? body.page : 1;
  const project = body.project?.trim() || null;

  // Resolve category ids for hard post-filtering after provider search.
  const categoryIds: SearchCategoryId[] = Array.isArray(filters.categoryIds)
    ? filters.categoryIds
    : [];

  // Provider required by POST /api/leads/search: resolved from the project
  // registry (per-project configuration), with an optional explicit request
  // override, falling back to the registry default. Unsupported values are
  // never forwarded — the backend Joi schema would reject them with a 400.
  const provider = getProjectProvider(projectConfig, body.provider);

  // Build the payload for the provider backend. `keywords` is forwarded
  // as a free-text search hint (never merged into industry).
  const providerPayload: Record<string, unknown> = { provider, filters, page };

  // 1. Forward to the existing provider backend.
  let providerRes: Response;
  try {
    providerRes = await postToBackend("/api/leads/search", providerPayload);
  } catch {
    return NextResponse.json(
      { error: "Provider backend is unreachable. Start the CRM backend (backendZip) and try again." },
      { status: 502 }
    );
  }

  const payload = (await providerRes.json().catch(() => null)) as {
    success?: boolean;
    data?: { items?: ProviderLead[] };
    error?: { message?: string };
  } | null;

  if (!providerRes.ok || !payload?.success) {
    return NextResponse.json(
      { error: payload?.error?.message ?? `Provider search failed (${providerRes.status}).` },
      { status: 502 }
    );
  }

  const items = Array.isArray(payload.data?.items) ? payload.data.items : [];

  // HARD CATEGORY FILTER — when a user selects e.g. only "Hotels", any
  // provider result that is not a hotel property is dropped here. This is
  // the actual guarantee behind the category chips; provider search is only
  // a pre-filter and is always noisy.
  let filteredOut = 0;
  const kept: ProviderLead[] = [];
  if (categoryIds.length > 0) {
    for (const item of items) {
      if (leadMatchesCategories(item, categoryIds)) {
        kept.push(item);
      } else {
        filteredOut++;
      }
    }
  } else {
    kept.push(...items);
  }

  // Geocode real locations that the provider returned without coordinates
  // (budget-capped, cached, rate-limited). Provider-returned coordinates are
  // kept as-is and always win; unresolvable locations stay null — coordinates
  // are never generated or estimated here.
  let geocoded = 0;
  if (geocodeEnabled()) {
    for (const item of kept) {
      if (toNumber(item.latitude) !== null && toNumber(item.longitude) !== null) continue;
      if (geocoded >= GEOCODE_MAX_PER_REQUEST) break;
      if (!item.location?.trim()) continue;
      const coords = await geocodeLocation(item.location);
      if (coords) {
        item.latitude = coords.latitude;
        item.longitude = coords.longitude;
        geocoded++;
      }
    }
  }

  // 2. Persist normalized results into the pipeline DB. The Lead model requires
  //    an email — items without one stay in the response only (never faked).
  let saved = 0;
  let duplicates = 0;
  for (const item of kept) {
    const email = (item.email ?? "").trim();
    if (!email) continue;
    try {
      await prisma.lead.create({
        data: {
          ...toLeadDetails(item),
          name: (item.fullName ?? "").trim() || email.split("@")[0],
          email,
          website: (item.companyWebsite ?? "").trim(),
          project,
          source: (item.source ?? provider).trim() || provider,
        },
      });
      saved++;
    } catch (error) {
      if (isUniqueViolation(error)) duplicates++;
      else console.error("Failed to save discovered lead:", error);
    }
  }

  // 3. Attach the real pipeline state for persisted leads.
  const emails = kept.map((i) => (i.email ?? "").trim()).filter(Boolean);
  const rows =
    emails.length > 0 ? await prisma.lead.findMany({ where: { email: { in: emails } } }) : [];
  const byEmail = new Map(rows.map((r) => [r.email.toLowerCase(), r]));

  const leads = kept.map((item, idx) => {
    const key = (item.email ?? "").trim().toLowerCase();
    const row = key ? byEmail.get(key) : undefined;
    return {
      id: row ? String(row.id) : (item.id ?? `provider-${idx}`),
      dbId: row ? row.id : null,
      firstName: item.firstName ?? "",
      lastName: item.lastName ?? "",
      fullName: item.fullName ?? "",
      jobTitle: item.jobTitle ?? "",
      companyName: item.companyName ?? "",
      hotelName: item.hotelName ?? item.companyName ?? "",
      brandType: item.brandType ?? "",
      propertySizeCategory: item.propertySizeCategory ?? "",
      companyWebsite: item.companyWebsite ?? "",
      email: item.email ?? "",
      emailStatus: item.emailStatus ?? "",
      phone: item.phone ?? "",
      linkedinUrl: item.linkedinUrl ?? "",
      location: item.location ?? "",
      city: item.city ?? "",
      exactAddress: item.exactAddress ?? "",
      googleMapsLink: item.googleMapsLink ?? "",
      industry: item.industry ?? "",
      latitude: toNumber(item.latitude),
      longitude: toNumber(item.longitude),
      source: item.source ?? provider,
      googleBusinessLink: item.googleBusinessLink ?? "",
      tripAdvisorLink: item.tripAdvisorLink ?? "",
      bookingComLink: item.bookingComLink ?? "",
      makeMyTripLink: item.makeMyTripLink ?? "",
      instagramLink: item.instagramLink ?? "",
      facebookLink: item.facebookLink ?? "",
      googleRating: toNumber(item.googleRating),
      totalReviewsCount: toNumber(item.totalReviewsCount),
      sentimentScore: toNumber(item.sentimentScore),
      state: row ? row.status : "NEW",
    };
  });

  return NextResponse.json({ total: leads.length, saved, duplicates, geocoded, filteredOut, leads });
}