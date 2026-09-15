import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PROVIDER_BACKEND_URL } from "@/lib/providerBackend";
import { getProject, getProjectProvider, mergeProjectFilters } from "@/lib/projects";
import { GEOCODE_MAX_PER_REQUEST, geocodeEnabled, geocodeLocation } from "@/lib/geocode";
import {
  resolveCategoryIds,
  leadMatchesCategories,
  type SearchCategoryId,
} from "@/lib/categorySearch";

export const runtime = "nodejs";

/**
 * Lead discovery BFF — connects the frontend to the EXISTING provider backend
 * (backendZip: POST /api/leads/search → Prospeo/Hunter/Apollo provider service) and
 * persists the normalized results into the Sales Engine pipeline (Prisma).
 * Deduplication is owned by the database unique constraint (email + website).
 * No provider API keys exist in this (or any) frontend file.
 *
 * Fully project-agnostic: the selected project's requirements come from the
 * project registry (lib/projects) and are merged with the user's filters;
 * locations without provider coordinates are geocoded via lib/geocode.
 * No project-specific branches exist anywhere in this route.
 */

interface NormalizedProviderLead {
  id?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: string;
  companyName?: string;
  companyWebsite?: string;
  email?: string;
  emailStatus?: string;
  phone?: string;
  linkedinUrl?: string;
  location?: string;
  industry?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  source?: string;
  hotelName?: string;
  brandType?: string;
  propertySizeCategory?: string;
  city?: string;
  state?: string;
  exactAddress?: string;
  googleMapsLink?: string;
  googleBusinessLink?: string;
  tripAdvisorLink?: string;
  bookingComLink?: string;
  makeMyTripLink?: string;
  instagramLink?: string;
  facebookLink?: string;
  googleRating?: number | string | null;
  totalReviewsCount?: number | string | null;
  sentimentScore?: number | string | null;
}

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

function toCoord(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
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
    providerRes = await fetch(`${PROVIDER_BACKEND_URL}/api/leads/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(providerPayload),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Provider backend is unreachable. Start the CRM backend (backendZip) and try again." },
      { status: 502 }
    );
  }

  const payload = (await providerRes.json().catch(() => null)) as {
    success?: boolean;
    data?: { items?: NormalizedProviderLead[] };
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
  const kept: NormalizedProviderLead[] = [];
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
      if (toCoord(item.latitude) !== null && toCoord(item.longitude) !== null) continue;
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
          name: (item.fullName ?? "").trim() || email.split("@")[0],
          hotelName: (item.hotelName ?? item.companyName ?? "").trim() || null,
          brandType: (item.brandType ?? "").trim() || null,
          propertySizeCategory: (item.propertySizeCategory ?? "").trim() || null,
          email,
          website: (item.companyWebsite ?? "").trim(),
          company: (item.companyName ?? "").trim() || null,
          jobTitle: (item.jobTitle ?? "").trim() || null,
          phone: (item.phone ?? "").trim() || null,
          linkedinUrl: (item.linkedinUrl ?? "").trim() || null,
          location: (item.location ?? "").trim() || null,
          city: (item.city ?? "").trim() || null,
          state: (item.state ?? "").trim() || null,
          exactAddress: (item.exactAddress ?? "").trim() || null,
          googleMapsLink: (item.googleMapsLink ?? "").trim() || null,
          industry: (item.industry ?? "").trim() || null,
          project,
          source: (item.source ?? provider).trim() || provider,
          googleBusinessLink: (item.googleBusinessLink ?? "").trim() || null,
          tripAdvisorLink: (item.tripAdvisorLink ?? "").trim() || null,
          bookingComLink: (item.bookingComLink ?? "").trim() || null,
          makeMyTripLink: (item.makeMyTripLink ?? "").trim() || null,
          instagramLink: (item.instagramLink ?? "").trim() || null,
          facebookLink: (item.facebookLink ?? "").trim() || null,
          googleRating: toCoord(item.googleRating),
          totalReviewsCount: toCoord(item.totalReviewsCount),
          sentimentScore: toCoord(item.sentimentScore),
          latitude: toCoord(item.latitude),
          longitude: toCoord(item.longitude),
        },
      });
      saved++;
    } catch {
      duplicates++;
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
      latitude: toCoord(item.latitude),
      longitude: toCoord(item.longitude),
      source: item.source ?? provider,
      googleBusinessLink: item.googleBusinessLink ?? "",
      tripAdvisorLink: item.tripAdvisorLink ?? "",
      bookingComLink: item.bookingComLink ?? "",
      makeMyTripLink: item.makeMyTripLink ?? "",
      instagramLink: item.instagramLink ?? "",
      facebookLink: item.facebookLink ?? "",
      googleRating: toCoord(item.googleRating),
      totalReviewsCount: toCoord(item.totalReviewsCount),
      sentimentScore: toCoord(item.sentimentScore),
      state: row ? row.status : "NEW",
    };
  });

  return NextResponse.json({ total: leads.length, saved, duplicates, geocoded, filteredOut, leads });
}