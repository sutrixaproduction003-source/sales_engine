import Papa from "papaparse";
import type { DiscoveryLead } from "@/lib/types";

/** Search-form values used as fallbacks when a provider omits a field. */
export interface DiscoveryDefaults {
  hotelName: string;
  brandType: string;
  propertySizeCategory: string;
}

/** Fields copied as-is from a search result. */
const PASSTHROUGH_FIELDS = [
  "id",
  "firstName",
  "lastName",
  "email",
  "phone",
  "jobTitle",
  "location",
  "city",
  "state",
  "exactAddress",
  "googleMapsLink",
  "googleBusinessLink",
  "tripAdvisorLink",
  "bookingComLink",
  "makeMyTripLink",
  "instagramLink",
  "facebookLink",
  "googleRating",
  "totalReviewsCount",
  "sentimentScore",
  "linkedinUrl",
  "industry",
  "source",
  "category",
  "subCategory",
  "classificationConfidence",
  "classificationReason",
  "linkedinAvailable",
  "linkedinSource",
  "linkedinCompanyUrl",
] as const;

/** Map one item from POST /api/search into a DiscoveryLead. */
export function toDiscoveryLead(item: Record<string, unknown>, defaults: DiscoveryDefaults): DiscoveryLead {
  const lead = item as Partial<DiscoveryLead> & { name?: string; company?: string; website?: string };

  return {
    ...Object.fromEntries(PASSTHROUGH_FIELDS.map((field) => [field, item[field]])),
    fullName: lead.fullName || lead.name,
    companyName: lead.companyName || lead.company,
    hotelName: lead.hotelName || defaults.hotelName || lead.companyName || lead.company,
    brandType: lead.brandType || defaults.brandType,
    propertySizeCategory: lead.propertySizeCategory || defaults.propertySizeCategory,
    companyWebsite: lead.website || lead.companyWebsite,
  } as DiscoveryLead;
}

/** Look up Google ratings for the first `limit` leads (bounded request count). */
export async function withReviewRatings(leads: DiscoveryLead[], limit = 8): Promise<DiscoveryLead[]> {
  return Promise.all(
    leads.map(async (lead, idx) => {
      if (idx >= limit || !lead.companyName) return lead;
      try {
        const response = await fetch("/api/search/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company: lead.companyName, location: lead.location }),
        });
        const review = await response.json();
        return {
          ...lead,
          googleRating: review.rating ?? lead.googleRating,
          totalReviewsCount: review.reviewCount ?? lead.totalReviewsCount,
          googleBusinessLink: review.link || lead.googleBusinessLink,
        };
      } catch {
        return lead;
      }
    })
  );
}

/** Download discovered leads as a CSV file. */
export function exportLeadsCsv(leads: DiscoveryLead[]) {
  if (leads.length === 0) return;

  const rows = leads.map((lead) => ({
    "Full Name": lead.fullName,
    "First Name": lead.firstName,
    "Last Name": lead.lastName,
    Email: lead.email,
    Phone: lead.phone,
    "Job Title": lead.jobTitle,
    Company: lead.companyName,
    "Hotel Name": lead.hotelName,
    "Brand Type": lead.brandType,
    "Property Size": lead.propertySizeCategory,
    Website: lead.companyWebsite,
    Location: lead.location,
    City: lead.city,
    State: lead.state,
    "Exact Address": lead.exactAddress,
    "Google Maps": lead.googleMapsLink,
    "Google Business": lead.googleBusinessLink,
    TripAdvisor: lead.tripAdvisorLink,
    "Booking.com": lead.bookingComLink,
    MakeMyTrip: lead.makeMyTripLink,
    Instagram: lead.instagramLink,
    Facebook: lead.facebookLink,
    LinkedIn: lead.linkedinUrl,
    Industry: lead.industry,
    Source: lead.source,
    Category: lead.category,
    "Sub-Category": lead.subCategory,
    "Classification Confidence": lead.classificationConfidence
      ? `${Math.round(lead.classificationConfidence * 100)}%`
      : "",
    "Google Rating": lead.googleRating ?? "",
    "Total Reviews": lead.totalReviewsCount ?? "",
    "Sentiment Score": lead.sentimentScore ?? "",
  }));

  const blob = new Blob([Papa.unparse(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `discovery_leads_${new Date().toISOString().split("T")[0]}.csv`;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
