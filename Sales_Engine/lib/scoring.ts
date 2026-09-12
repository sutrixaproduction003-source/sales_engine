import { BusinessType, Classification, DecisionMakerTier } from '@prisma/client';

interface ScoringInput {
  name?: string;
  jobTitle?: string;
  company?: string;
  scrapedContext?: string;
  industry?: string;
  businessType?: string;
}

interface ScoringResult {
  businessType: BusinessType;
  classification: Classification;
  decisionMakerTier: DecisionMakerTier;
  relevanceScore: number;
  intentScore: number;
  buyingPowerScore: number;
  intentSignals: string[];
}

// Keywords for business type detection
const BUSINESS_TYPE_KEYWORDS = {
  HOTEL: ['hotel', 'inn', 'lodge', 'resort', 'palace', 'haveli'],
  RESORT: ['resort', 'villa', 'retreat', 'spa resort', 'boutique resort'],
  RESTAURANT: ['restaurant', 'cafe', 'bistro', 'eatery', 'dining', 'f&b'],
  SERVICE_APARTMENT: ['service apartment', 'serviced apartment', 'apartment', 'pg', 'hostel'],
  CONSULTANT: ['consultant', 'consulting', 'it consultant', 'software', 'developer'],
  EVENT_PLANNER: ['event planner', 'wedding planner', 'event manager'],
  TRAINING_INSTITUTE: ['training', 'institute', 'academy', 'school'],
};

// Keywords for intent signals
const INTENT_KEYWORDS = {
  expansion: ['expanding', 'expansion', 'new property', 'new hotel', 'launch', 'opening'],
  digital: ['digital transformation', 'automation', 'cloud', 'online', 'digital'],
  pms: ['pms', 'channel manager', 'pos', 'property management', 'booking system'],
  hiring: ['hiring', 'recruiting', 'new team', 'operations', 'management'],
};

// Decision maker keywords
const DECISION_MAKER_TIER_1 = ['owner', 'founder', 'ceo', 'managing director', 'director', 'gm', 'general manager'];
const DECISION_MAKER_TIER_2 = ['manager', 'head', 'supervisor', 'coordinator', 'consultant', 'director'];
// Luxury/premium keywords for buying power
const LUXURY_KEYWORDS = ['luxury', 'premium', '5-star', 'five star', 'palace', 'taj', 'oberoi', 'hyatt', 'hilton', 'marriott'];
const PREMIUM_KEYWORDS = ['boutique', 'heritage', 'high-end', 'upscale'];

export function scoreLead(input: ScoringInput): ScoringResult {
  const text = `${input.name || ''} ${input.jobTitle || ''} ${input.company || ''} ${input.scrapedContext || ''} ${input.industry || ''}`.toLowerCase();

  // 1. Determine Business Type
  const businessType = determineBusinessType(text, input.company);

  // 2. Determine Classification
  const classification = determineClassification(businessType);

  // 3. Determine Decision Maker Tier
  const decisionMakerTier = determineDecisionMakerTier(input.jobTitle);

  // 4. Calculate Relevance Score (0-100)
  const relevanceScore = calculateRelevanceScore(businessType, decisionMakerTier);

  // 5. Calculate Intent Score (0-100)
  const { intentScore, signals } = calculateIntentScore(text);

  // 6. Calculate Buying Power Score (0-100)
  const buyingPowerScore = calculateBuyingPowerScore(businessType, text, input.company);

  return {
    businessType,
    classification,
    decisionMakerTier,
    relevanceScore,
    intentScore,
    buyingPowerScore,
    intentSignals: signals,
  };
}

function determineBusinessType(text: string, company?: string): BusinessType {
  const companyText = company?.toLowerCase() || '';

  for (const [type, keywords] of Object.entries(BUSINESS_TYPE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword) || companyText.includes(keyword)) {
        return type as BusinessType;
      }
    }
  }

  return BusinessType.OTHER;
}

function determineClassification(businessType: BusinessType): Classification {
  const directCustomerTypes: BusinessType[] = [
    BusinessType.HOTEL,
    BusinessType.RESORT,
    BusinessType.RESTAURANT,
    BusinessType.SERVICE_APARTMENT,
  ];

  if (directCustomerTypes.includes(businessType)) {
    return Classification.DIRECT_CUSTOMER;
  }

  return Classification.CHANNEL_PARTNER;
}

function determineDecisionMakerTier(jobTitle?: string): DecisionMakerTier {
  if (!jobTitle) return DecisionMakerTier.TIER_3;

  const title = jobTitle.toLowerCase();

  for (const keyword of DECISION_MAKER_TIER_1) {
    if (title.includes(keyword)) return DecisionMakerTier.TIER_1;
  }

  for (const keyword of DECISION_MAKER_TIER_2) {
    if (title.includes(keyword)) return DecisionMakerTier.TIER_2;
  }

  return DecisionMakerTier.TIER_3;
}

function calculateRelevanceScore(businessType: BusinessType, tier: DecisionMakerTier): number {
  let score = 0;

  // Business type relevance
  switch (businessType) {
    case BusinessType.HOTEL:
    case BusinessType.RESORT:
    case BusinessType.RESTAURANT:
    case BusinessType.SERVICE_APARTMENT:
      score += 85;
      break;
    case BusinessType.CONSULTANT:
    case BusinessType.EVENT_PLANNER:
    case BusinessType.TRAINING_INSTITUTE:
      score += 65;
      break;
    default:
      score += 30;
  }

  // Decision maker tier bonus
  if (tier === DecisionMakerTier.TIER_1) score += 15;
  else if (tier === DecisionMakerTier.TIER_2) score += 8;

  return Math.min(score, 100);
}

function calculateIntentScore(text: string): { intentScore: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  // Check for expansion signals (+30)
  for (const keyword of INTENT_KEYWORDS.expansion) {
    if (text.includes(keyword)) {
      score += 30;
      signals.push(`Expansion signal: "${keyword}"`);
      break;
    }
  }

  // Check for digital/automation signals (+20)
  for (const keyword of INTENT_KEYWORDS.digital) {
    if (text.includes(keyword)) {
      score += 20;
      signals.push(`Digital transformation: "${keyword}"`);
      break;
    }
  }

  // Check for PMS/tech tools (+20)
  for (const keyword of INTENT_KEYWORDS.pms) {
    if (text.includes(keyword)) {
      score += 20;
      signals.push(`Tech adoption: "${keyword}"`);
      break;
    }
  }

  // Check for hiring/operations signals (+15)
  for (const keyword of INTENT_KEYWORDS.hiring) {
    if (text.includes(keyword)) {
      score += 15;
      signals.push(`Growth signal: "${keyword}"`);
      break;
    }
  }

  return {
    intentScore: Math.min(score, 100),
    signals: signals.slice(0, 3), // Limit to 3 signals
  };
}

function calculateBuyingPowerScore(businessType: BusinessType, text: string, company?: string): number {
  let score = 0;
  const companyText = company?.toLowerCase() || '';
  const allText = text + ' ' + companyText;

  // Luxury indicators (+90-100)
  for (const keyword of LUXURY_KEYWORDS) {
    if (allText.includes(keyword)) {
      return 95;
    }
  }

  // Premium indicators (+70-89)
  for (const keyword of PREMIUM_KEYWORDS) {
    if (allText.includes(keyword)) {
      score = 80;
      break;
    }
  }

  // Business type based scores
  if (score === 0) {
    switch (businessType) {
      case BusinessType.RESORT:
        score = 85;
        break;
      case BusinessType.HOTEL:
        score = 75;
        break;
      case BusinessType.RESTAURANT:
        score = 70;
        break;
      case BusinessType.SERVICE_APARTMENT:
        score = 55;
        break;
      case BusinessType.CONSULTANT:
        score = 60;
        break;
      default:
        score = 40;
    }
  }

  return Math.min(score, 100);
}
