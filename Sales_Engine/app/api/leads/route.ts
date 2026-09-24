import { NextResponse } from "next/server";
import { DuplicateLeadError, listLeads, transaction } from "@/lib/leadDb";
import Papa from "papaparse";
import { toLeadDetails } from "@/lib/leadRecord";

export const runtime = "nodejs";
// Reads the leads spreadsheet on every request; never prerender.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

export async function GET() {
  try {
    const leads = await listLeads({ newestFirst: true });
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
      return NextResponse.json({ error: "No valid rows found" }, { status: 400 });
    }

    const created = await transaction((tx) => {
      let count = 0;
      for (const row of rows) {
        const data = {
          ...toLeadDetails({
            hotelName: row.hotel_name || row.company,
            brandType: row.brand_type,
            propertySizeCategory: row.property_size_category,
            companyName: row.company,
            jobTitle: row.job_title,
            phone: row.phone,
            linkedinUrl: row.linkedin_url,
            location: row.location,
            city: row.city,
            state: row.state,
            exactAddress: row.exact_address,
            googleMapsLink: row.google_maps_link,
            industry: row.industry,
            googleBusinessLink: row.google_business_link,
            tripAdvisorLink: row.tripadvisor_link,
            bookingComLink: row.booking_com_link,
            makeMyTripLink: row.makemytrip_link,
            instagramLink: row.instagram_link,
            facebookLink: row.facebook_link,
            googleRating: row.google_rating,
            totalReviewsCount: row.total_reviews_count,
            sentimentScore: row.sentiment_score,
            latitude: row.latitude,
            longitude: row.longitude,
          }),
          name: row.name?.trim() ?? "",
          website: row.website?.trim() ?? "",
          email: row.email?.trim() ?? "",
          project: row.project?.trim() || null,
          source: row.source?.trim() || "CSV Import",
        };
        try {
          tx.create(data);
          count++;
        } catch (error) {
          // Duplicate email + website rows are skipped.
          if (!(error instanceof DuplicateLeadError)) throw error;
        }
      }
      return count;
    });

    return NextResponse.json({ created, skipped: rows.length - created });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}