import { NextResponse } from "next/server";
import { transaction } from "@/lib/leadDb";
import { cleanString } from "@/lib/leadRecord";
import { pickContactEmail } from "@/lib/contactEmail";
import type { Lead } from "@/lib/leadModel";
import type { ScrapedPlace } from "@/lib/places";

export const runtime = "nodejs";

const GENERIC = new Set([
  "the", "and", "ltd", "limited", "pvt", "private", "inc", "llp", "co", "company", "corp", "corporation",
  "india", "group", "industries", "industry", "enterprises", "international", "services", "solutions",
]);

const tokens = (name: string) =>
  name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !GENERIC.has(w));

/** The Google Maps result is plausibly the lead's company (shares a distinctive word). */
function sameCompany(company: string, place: ScrapedPlace) {
  const wanted = tokens(company);
  const found = place.companyName.toLowerCase();
  return wanted.length === 0 || wanted.some((t) => found.includes(t));
}

/** The place is in the lead's city or state ("FUTURE ENERGY, Gurugram" ≠ a New York listing). */
function samePlace(lead: Lead, place: ScrapedPlace) {
  const wanted = [lead.city, lead.state]
    .map((v) => (v ?? "").toLowerCase().replace(/\s+district$/, "").trim())
    .filter(Boolean);
  if (wanted.length === 0) return true;
  const where = [place.exactAddress, place.location, place.city, place.state].join(" ").toLowerCase();
  return wanted.some((w) => where.includes(w));
}

/**
 * POST /api/sales-navigator/enrich — { matches: [{ company, leadIds, place }] }
 * Adds the company's website, public email, phone, address and map location
 * to imported leads. Fields the lead already has are kept; results that don't
 * look like the same company are skipped.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    matches?: { company: string; leadIds: number[]; place: ScrapedPlace | null }[];
  };
  const matches = Array.isArray(body.matches) ? body.matches : [];

  try {
    const result = await transaction((tx) => {
      let enriched = 0;
      let withEmail = 0;
      const skipped: string[] = [];

      for (const { company, leadIds, place } of matches) {
        if (!place || !sameCompany(company, place)) {
          skipped.push(company);
          continue;
        }
        let matched = false;
        for (const id of leadIds) {
          const lead = tx.find((l) => l.id === id);
          if (!lead || !samePlace(lead, place)) continue;
          matched = true;
          // Their own address if the site lists it, else a general inbox —
          // never another named person's address or HR/careers.
          const email = pickContactEmail(place.emails?.length ? place.emails : [place.email], lead.name, place.companyWebsite);
          const updated = tx.update(id, {
            website: lead.website || cleanString(place.companyWebsite),
            email: lead.email || email,
            phone: lead.phone || cleanString(place.phone) || null,
            exactAddress: lead.exactAddress || cleanString(place.exactAddress) || null,
            googleMapsLink: lead.googleMapsLink || place.googleMapsLink || null,
            googleRating: lead.googleRating ?? place.googleRating,
            totalReviewsCount: lead.totalReviewsCount ?? place.totalReviewsCount,
            industry: lead.industry || cleanString(place.industry) || null,
            latitude: lead.latitude ?? place.latitude,
            longitude: lead.longitude ?? place.longitude,
          });
          if (updated) {
            enriched++;
            if (updated.email) withEmail++;
          }
        }
        if (!matched) skipped.push(company);
      }
      return { enriched, withEmail, skipped };
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enrichment failed." }, { status: 500 });
  }
}
