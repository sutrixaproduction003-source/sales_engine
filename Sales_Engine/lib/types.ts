/**
 * Shared frontend types — adapted to the ACTUAL backend contracts:
 *
 * - PipelineLead → `Lead` rows (lib/leadModel) from GET /api/leads
 *   (Sales Engine pipeline DB)
 *
 * - DiscoveryLead → normalized provider leads returned by
 *   POST /api/search (Discovery page)
 *
 *   The backend normalizes Apollo payloads.
 *
 * - StatsResponse → GET /api/stats pipeline counters
 *
 * Category and intelligence fields are optional so existing
 * provider/search/enrichment functionality continues to work.
 */

export type PipelineStatus =
  | "PENDING"
  | "SCRAPED"
  | "PERSONALIZED"
  | "SYNCED";

export type BusinessType =
  | "HOTEL"
  | "RESORT"
  | "RESTAURANT"
  | "SERVICE_APARTMENT"
  | "SPA"
  | "CONSULTANT"
  | "EVENT_PLANNER"
  | "FB_CONSULTANT"
  | "FB_SUPPLIER"
  | "TRAINING_INSTITUTE"
  | "OTHER";

export type Classification =
  | "DIRECT_CUSTOMER"
  | "CHANNEL_PARTNER";

export type DecisionMakerTier =
  | "TIER_1"
  | "TIER_2"
  | "TIER_3";

/**
 * Main Sales Engine category.
 *
 * Channel Partner:
 * Someone/business that can influence or connect us
 * with hospitality businesses.
 *
 * Direct Customer:
 * A business that can directly use Sutrixa OS.
 */
export type LeadCategory =
  | "channel_partner"
  | "direct_customer";

/**
 * Detailed category/sub-category.
 *
 * These values correspond to the backend config/leadCategories.js.
 */
export type LeadSubCategory =
  // Channel Partners
  | "hotel_consultant"
  | "wedding_event_manager"
  | "fb_consultant"
  | "fb_supplier"
  | "training_institute"

  // Direct Customers
  | "hotel"
  | "resort"
  | "spa"
  | "restaurant"
  | "service_apartment";

/**
 * AI classification confidence.
 *
 * 0–1 is recommended internally for normalized confidence,
 * while the UI can convert it to a percentage.
 */
export type ClassificationConfidence = number;

export interface PipelineLead {
  id: number;

  name: string;

  hotelName?: string | null;

  brandType?: string | null;

  propertySizeCategory?: string | null;

  company: string | null;

  website: string;

  /** Null for scraped businesses without a public email. */
  email: string | null;

  scrapedContext: string | null;

  icebreaker: string | null;

  status: PipelineStatus;

  jobTitle?: string | null;

  phone?: string | null;

  linkedinUrl?: string | null;

  linkedinAvailable?: boolean;

  linkedinSource?: string | null;

  linkedinCompanyUrl?: string | null;

  location?: string | null;

  city?: string | null;

  state?: string | null;

  exactAddress?: string | null;

  googleMapsLink?: string | null;

  industry?: string | null;

  project?: string | null;

  source?: string | null;

  googleBusinessLink?: string | null;

  tripAdvisorLink?: string | null;

  bookingComLink?: string | null;

  makeMyTripLink?: string | null;

  instagramLink?: string | null;

  facebookLink?: string | null;

  googleRating?: number | null;

  totalReviewsCount?: number | null;

  sentimentScore?: number | null;

  latitude?: number | null;

  longitude?: number | null;

  // ============================================================
  // EXISTING SCORING FIELDS
  // ============================================================

  businessType?: BusinessType | null;

  classification?: Classification | null;

  decisionMakerTier?: DecisionMakerTier | null;

  relevanceScore?: number;

  intentScore?: number;

  buyingPowerScore?: number;

  intentSignals?: string | null;

  // ============================================================
  // NEW SALES ENGINE CATEGORY FIELDS
  // ============================================================

  /**
   * Main Sales Engine category:
   * Channel Partner OR Direct Customer.
   */
  category?: LeadCategory | null;

  /**
   * Detailed category.
   */
  subCategory?: LeadSubCategory | null;

  /**
   * AI confidence for the classification.
   */
  classificationConfidence?: ClassificationConfidence | null;

  // ============================================================
  // FUTURE AI INTELLIGENCE FIELDS
  // ============================================================

  influenceScore?: number | null;

  hotelNetworkStrength?: number | null;

  portfolioStrengthScore?: number | null;

  hotelDependencyScore?: number | null;

  revenueInfluenceScore?: number | null;

  operationalInfluenceScore?: number | null;

  businessTypeTag?: string | null;

  workforceInfluenceScore?: number | null;

  hotelLinkageScore?: number | null;

  systemNeedScore?: number | null;

  complexityScore?: number | null;

  digitalMaturityScore?: number | null;

  revenuePotentialScore?: number | null;

  automationNeedScore?: number | null;

  hotelExposureScore?: number | null;

  decisionPowerScore?: number | null;

  industryAuthorityScore?: number | null;

  commercialIntentScore?: number | null;

  // ============================================================
  // AI SIGNALS
  // ============================================================

  detectedSignals?: string[] | null;

  technologySignals?: string[] | null;

  growthSignals?: string[] | null;

  commercialSignals?: string[] | null;

  // ============================================================
  // SALES ACTION
  // ============================================================

  priority?: "HOT" | "WARM" | "COLD" | null;

  recommendedAction?: string | null;

  pitchType?: string | null;

  messageAngle?: string | null;

  conversionProbability?: number | null;

  whyRelevant?: string | null;

  aiEvaluatedAt?: string | null;

  // ============================================================
  // TIMESTAMPS
  // ============================================================

  createdAt: string;

  updatedAt: string;
}

export interface SearchFilters {
  location?: string;

  industry?: string;

  /**
   * Optional selectable target categories.
   *
   * These can later be populated from the project registry
   * or the backend config/leadCategories.js.
   */
  categories?: string[];

  job_title?: string;

  /** Free-text keyword hints derived from selected categories. */
  keywords?: string;
}

export type DiscoveryState = PipelineStatus | "NEW";

export interface DiscoveryLead {
  id: string;

  /**
   * Pipeline DB id when the lead was persisted,
   * otherwise null.
   */
  dbId: number | null;

  firstName: string;

  lastName: string;

  fullName: string;

  jobTitle: string;

  companyName: string;

  hotelName?: string;

  brandType?: string;

  propertySizeCategory?: string;

  companyWebsite: string;

  email: string;

  emailStatus: string;

  phone: string;

  linkedinUrl: string;

  /**
   * Whether a real LinkedIn URL was returned
   * by a provider/enrichment source.
   */
  linkedinAvailable?: boolean;

  /**
   * Provider/source that supplied the LinkedIn URL.
   */
  linkedinSource?: string | null;

  /**
   * Company's LinkedIn URL, when available.
   */
  linkedinCompanyUrl?: string | null;

  location: string;

  city?: string;

  exactAddress?: string;

  googleMapsLink?: string;

  industry: string;

  latitude: number | null;

  longitude: number | null;

  /**
   * Provider/source name as returned by the backend
   * (e.g. "apollo").
   */
  source: string;

  googleBusinessLink?: string;

  tripAdvisorLink?: string;

  bookingComLink?: string;

  makeMyTripLink?: string;

  instagramLink?: string;

  facebookLink?: string;

  googleRating?: number | null;

  totalReviewsCount?: number | null;

  sentimentScore?: number | null;

  state: DiscoveryState;

  // ============================================================
  // NEW SALES ENGINE CATEGORY FIELDS
  // ============================================================

  category?: LeadCategory | null;

  subCategory?: LeadSubCategory | null;

  classificationConfidence?: ClassificationConfidence | null;

  // ============================================================
  // EXISTING / FUTURE SCORING
  // ============================================================

  businessType?: BusinessType | null;

  classification?: Classification | null;

  decisionMakerTier?: DecisionMakerTier | null;

  relevanceScore?: number | null;

  intentScore?: number | null;

  buyingPowerScore?: number | null;

  intentSignals?: string | null;

  // ============================================================
  // INTELLIGENCE SCORES
  // ============================================================

  influenceScore?: number | null;

  hotelNetworkStrength?: number | null;

  portfolioStrengthScore?: number | null;

  hotelDependencyScore?: number | null;

  revenueInfluenceScore?: number | null;

  operationalInfluenceScore?: number | null;

  workforceInfluenceScore?: number | null;

  hotelLinkageScore?: number | null;

  systemNeedScore?: number | null;

  complexityScore?: number | null;

  digitalMaturityScore?: number | null;

  revenuePotentialScore?: number | null;

  automationNeedScore?: number | null;

  hotelExposureScore?: number | null;

  decisionPowerScore?: number | null;

  industryAuthorityScore?: number | null;

  commercialIntentScore?: number | null;

  // ============================================================
  // AI SIGNALS
  // ============================================================

  detectedSignals?: string[] | null;

  technologySignals?: string[] | null;

  growthSignals?: string[] | null;

  commercialSignals?: string[] | null;

  // ============================================================
  // SALES ACTION
  // ============================================================

  priority?: "HOT" | "WARM" | "COLD" | null;

  recommendedAction?: string | null;

  pitchType?: string | null;

  messageAngle?: string | null;

  conversionProbability?: number | null;

  whyRelevant?: string | null;

  aiEvaluatedAt?: string | null;
}


export interface StatsResponse {
  total: number;

  pending: number;

  scraped: number;

  personalized: number;

  synced: number;
}

export interface ProviderHealth {
  success: boolean;

  providers: Record<
    string,
    {
      configured: boolean;
    }
  >;
}