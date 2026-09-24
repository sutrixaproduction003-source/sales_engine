/**
 * Mapping from a provider/CSV lead into the optional columns of a pipeline
 * Lead (lib/leadModel). Shared by discovery, enrichment and CSV import so a lead is
 * stored the same way no matter how it entered the pipeline.
 */

/** Lead fields as returned by the provider backend (normalized camelCase). */
export interface ProviderLead {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  companyWebsite?: string | null;
  email?: string | null;
  emailStatus?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  location?: string | null;
  industry?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  source?: string | null;
  hotelName?: string | null;
  brandType?: string | null;
  propertySizeCategory?: string | null;
  city?: string | null;
  state?: string | null;
  exactAddress?: string | null;
  googleMapsLink?: string | null;
  googleBusinessLink?: string | null;
  tripAdvisorLink?: string | null;
  bookingComLink?: string | null;
  makeMyTripLink?: string | null;
  instagramLink?: string | null;
  facebookLink?: string | null;
  googleRating?: number | string | null;
  totalReviewsCount?: number | string | null;
  sentimentScore?: number | string | null;
}

/** Trimmed string, or "" for anything that is not a string. */
export function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const stringOrNull = (value: unknown): string | null => cleanString(value) || null;

/** Finite number from a number or numeric string, otherwise null. */
export function toNumber(value: unknown): number | null {
  if (typeof value === "string" && !value.trim()) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

const toInt = (value: unknown): number | null => {
  const n = toNumber(value);
  return n === null ? null : Math.round(n);
};

export const NUMERIC_LEAD_FIELDS = [
  "googleRating",
  "totalReviewsCount",
  "sentimentScore",
  "latitude",
  "longitude",
] as const;

/**
 * Optional Lead columns derived from a provider lead. Identity columns
 * (name, email, website) and pipeline columns (project, source, status) are
 * left to the caller.
 */
export function toLeadDetails(item: ProviderLead) {
  return {
    hotelName: stringOrNull(item.hotelName) ?? stringOrNull(item.companyName),
    brandType: stringOrNull(item.brandType),
    propertySizeCategory: stringOrNull(item.propertySizeCategory),
    company: stringOrNull(item.companyName),
    jobTitle: stringOrNull(item.jobTitle),
    phone: stringOrNull(item.phone),
    linkedinUrl: stringOrNull(item.linkedinUrl),
    location: stringOrNull(item.location),
    city: stringOrNull(item.city),
    state: stringOrNull(item.state),
    exactAddress: stringOrNull(item.exactAddress),
    googleMapsLink: stringOrNull(item.googleMapsLink),
    industry: stringOrNull(item.industry),
    googleBusinessLink: stringOrNull(item.googleBusinessLink),
    tripAdvisorLink: stringOrNull(item.tripAdvisorLink),
    bookingComLink: stringOrNull(item.bookingComLink),
    makeMyTripLink: stringOrNull(item.makeMyTripLink),
    instagramLink: stringOrNull(item.instagramLink),
    facebookLink: stringOrNull(item.facebookLink),
    googleRating: toNumber(item.googleRating),
    totalReviewsCount: toInt(item.totalReviewsCount),
    sentimentScore: toNumber(item.sentimentScore),
    latitude: toNumber(item.latitude),
    longitude: toNumber(item.longitude),
  };
}
