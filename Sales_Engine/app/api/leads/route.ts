import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Papa from "papaparse";

export const runtime = "nodejs";
export const maxDuration =  60;

interface CsvRow {
  name?: string;
  hotel_name?: string;
  brand_type?: string;
  property_size_category?: string;
  company?: string;
  website?: string;
  email?: string;
  job_title?: string;
  phone?: string;
  linkedin_url?: string;
  location?: string;
  city?: string;
  state?: string;
  exact_address?: string;
  google_maps_link?: string;
  industry?: string;
  project?: string;
  source?: string;
  google_business_link?: string;
  tripadvisor_link?: string;
  booking_com_link?: string;
  makemytrip_link?: string;
  instagram_link?: string;
  facebook_link?: string;
  google_rating?: string;
  total_reviews_count?: string;
  sentiment_score?: string;
  latitude?: string;
  longitude?: string;
}

function toNum(value: string | undefined): number | null {
  if (!value || !value.trim()) return null;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  try {
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ leads });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch leads" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const file = await request.blob();
    const text = await file.text();
    if (!text.trim()) {
      return NextResponse.json({ error: "Empty CSV file" }, { status: 400 });
    }
    const parsed = Papa.parse<CsvRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });
    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { error: "CSV parse error: " + parsed.errors[0].message },
        { status: 400 }
      );
    }

    const rows = parsed.data.filter((r) => r.name && r.website && r.email);

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows found" }, { status:  400 });
    }

    let created =  0;
    for (const row of rows) {
      const data = {
        name: row.name?.trim() ?? "",
        hotelName: row.hotel_name?.trim() || row.company?.trim() || null,
        brandType: row.brand_type?.trim() || null,
        propertySizeCategory: row.property_size_category?.trim() || null,
        company: row.company?.trim() || null,
        website: row.website?.trim() ?? "",
        email: row.email?.trim() ?? "",
        jobTitle: row.job_title?.trim() || null,
        phone: row.phone?.trim() || null,
        linkedinUrl: row.linkedin_url?.trim() || null,
        location: row.location?.trim() || null,
        city: row.city?.trim() || null,
        state: row.state?.trim() || null,
        exactAddress: row.exact_address?.trim() || null,
        googleMapsLink: row.google_maps_link?.trim() || null,
        industry: row.industry?.trim() || null,
        project: row.project?.trim() || null,
        source: row.source?.trim() || "CSV Import",
        googleBusinessLink: row.google_business_link?.trim() || null,
        tripAdvisorLink: row.tripadvisor_link?.trim() || null,
        bookingComLink: row.booking_com_link?.trim() || null,
        makeMyTripLink: row.makemytrip_link?.trim() || null,
        instagramLink: row.instagram_link?.trim() || null,
        facebookLink: row.facebook_link?.trim() || null,
        googleRating: toNum(row.google_rating),
        totalReviewsCount: toNum(row.total_reviews_count),
        sentimentScore: toNum(row.sentiment_score),
        latitude: toNum(row.latitude),
        longitude: toNum(row.longitude),
      };
      try {
        await prisma.lead.create({ data });
        created++;
      } catch {
        // duplicate email+website: skip silently..
      }
    }

    return NextResponse.json({ created, skipped: rows.length - created });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status:  500 }
    );
  }
}