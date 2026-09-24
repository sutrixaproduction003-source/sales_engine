/**
 * The pipeline Lead record and its enums. Stored in the leads spreadsheet
 * (lib/leadDb); safe to import from client and server code.
 */

export const LeadStatus = {
  PENDING: "PENDING",
  SCRAPED: "SCRAPED",
  PERSONALIZED: "PERSONALIZED",
  /** Email sent (after human approval). */
  SYNCED: "SYNCED",
  /** Draft rejected in human review; never sent. */
  REJECTED: "REJECTED",
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const BusinessType = {
  HOTEL: "HOTEL",
  RESORT: "RESORT",
  RESTAURANT: "RESTAURANT",
  SERVICE_APARTMENT: "SERVICE_APARTMENT",
  CONSULTANT: "CONSULTANT",
  EVENT_PLANNER: "EVENT_PLANNER",
  TRAINING_INSTITUTE: "TRAINING_INSTITUTE",
  OTHER: "OTHER",
} as const;
export type BusinessType = (typeof BusinessType)[keyof typeof BusinessType];

export const Classification = {
  DIRECT_CUSTOMER: "DIRECT_CUSTOMER",
  CHANNEL_PARTNER: "CHANNEL_PARTNER",
} as const;
export type Classification = (typeof Classification)[keyof typeof Classification];

export const DecisionMakerTier = {
  TIER_1: "TIER_1",
  TIER_2: "TIER_2",
  TIER_3: "TIER_3",
} as const;
export type DecisionMakerTier = (typeof DecisionMakerTier)[keyof typeof DecisionMakerTier];

export interface Lead {
  id: number;
  name: string;
  hotelName: string | null;
  brandType: string | null;
  propertySizeCategory: string | null;
  company: string | null;
  website: string;
  /** Null for scraped businesses without a public email. */
  email: string | null;
  jobTitle: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  exactAddress: string | null;
  googleMapsLink: string | null;
  industry: string | null;
  project: string | null;
  source: string | null;
  googleBusinessLink: string | null;
  tripAdvisorLink: string | null;
  bookingComLink: string | null;
  makeMyTripLink: string | null;
  instagramLink: string | null;
  facebookLink: string | null;
  googleRating: number | null;
  totalReviewsCount: number | null;
  sentimentScore: number | null;
  /** Google Maps place id — dedupe key for scraped businesses. */
  googlePlaceId: string | null;
  hubspotContactId: string | null;
  hubspotCompanyId: string | null;
  hubspotSyncStatus: string | null;
  hubspotSyncedAt: Date | null;
  hubspotSyncError: string | null;
  latitude: number | null;
  longitude: number | null;
  scrapedContext: string | null;
  icebreaker: string | null;
  /** AI/template email draft, editable in human review. */
  emailSubject: string | null;
  emailBody: string | null;
  /** "ai" or "template". */
  draftMethod: string | null;
  sentAt: Date | null;
  sentMessageId: string | null;
  /** Last send or drafting error, shown in review. */
  sendError: string | null;
  status: LeadStatus;
  businessType: BusinessType | null;
  classification: Classification | null;
  decisionMakerTier: DecisionMakerTier | null;
  relevanceScore: number;
  intentScore: number;
  buyingPowerScore: number;
  /** JSON-stringified array. */
  intentSignals: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Fields accepted when creating a lead; everything else gets a default. */
export type LeadInput = Partial<Omit<Lead, "id" | "createdAt" | "updatedAt">> & {
  name: string;
  website: string;
};

export type LeadUpdate = Partial<Omit<Lead, "id" | "createdAt" | "updatedAt">>;
