/**
 * Sales Engine — Lead Intelligence
 *
 * Converts lead classification/context into sales-oriented signals.
 * This is intentionally rule-based for now so the system remains fast,
 * deterministic, and easy to replace with an AI model later.
 */

const { LEAD_CATEGORIES } = require('../config/leadCategories');

const HOT_THRESHOLD = 75;
const WARM_THRESHOLD = 50;

const CHANNEL_PARTNER = LEAD_CATEGORIES.CHANNEL_PARTNER.id;
const DIRECT_SUBCATEGORIES = Object.values(LEAD_CATEGORIES.DIRECT_CUSTOMER.subCategories).map((item) => item.id);

const DECISION_MAKER_TITLES = [
  'owner',
  'founder',
  'co-founder',
  'director',
  'general manager',
  'managing director',
  'ceo',
  'chief executive',
  'partner',
];

const MANAGEMENT_TITLES = ['manager', 'operations', 'commercial', 'sales', 'revenue', 'marketing', 'business development'];

const HOSPITALITY_INDUSTRY_TERMS = ['hospitality', 'hotel', 'restaurant', 'travel'];

/** Opportunity signal per sub-category. */
const SUBCATEGORY_SIGNALS = {
  hotel: 'Property operations opportunity',
  resort: 'Property operations opportunity',
  restaurant: 'Restaurant operations opportunity',
  service_apartment: 'Accommodation automation opportunity',
  spa: 'Wellness operations opportunity',
  hotel_consultant: 'Potential hotel network influence',
  wedding_event_manager: 'Potential venue and hotel influence',
  fb_consultant: 'Potential F&B network influence',
  fb_supplier: 'Potential F&B network influence',
  training_institute: 'Potential hospitality workforce influence',
};

const text = (value) => String(value || '').trim().toLowerCase();
const includesAny = (value, terms) => terms.some((term) => value.includes(term));

function normalizedContext(lead) {
  const jobTitle = text(lead.jobTitle);
  return {
    category: text(lead.category),
    subCategory: text(lead.subCategory),
    isDecisionMaker: includesAny(jobTitle, DECISION_MAKER_TITLES),
    isManagement: includesAny(jobTitle, MANAGEMENT_TITLES),
  };
}

/** Calculate sales signals from the normalized lead. */
function detectLeadSignals(lead, ctx = normalizedContext(lead)) {
  const positiveSignals = [];

  if (DIRECT_SUBCATEGORIES.includes(ctx.subCategory)) positiveSignals.push('Direct hospitality customer');
  if (ctx.category === CHANNEL_PARTNER) positiveSignals.push('Potential channel partner');
  if (includesAny(text(lead.industry), HOSPITALITY_INDUSTRY_TERMS)) positiveSignals.push('Hospitality-related industry');
  if (ctx.isDecisionMaker) positiveSignals.push('Likely decision maker');
  if (ctx.isManagement) positiveSignals.push('Management or commercial role');
  if (lead.email) positiveSignals.push('Email available');
  if (lead.phone) positiveSignals.push('Phone available');
  if (lead.linkedinUrl) positiveSignals.push('LinkedIn profile available');
  if (lead.companyWebsite) positiveSignals.push('Company website available');
  if (text(lead.companyName)) positiveSignals.push('Company identified');
  if (text(lead.location)) positiveSignals.push('Location identified');

  const signals = SUBCATEGORY_SIGNALS[ctx.subCategory] ? [SUBCATEGORY_SIGNALS[ctx.subCategory]] : [];

  return {
    signals: [...signals, ...positiveSignals],
    positiveSignals,
    negativeSignals: [],
  };
}

/** Calculate a 0–100 sales priority score. */
function calculatePriorityScore(lead, ctx = normalizedContext(lead)) {
  let score = 0;

  if (DIRECT_SUBCATEGORIES.includes(ctx.subCategory)) score += 30;
  if (ctx.category === CHANNEL_PARTNER) score += 25;

  if (ctx.isDecisionMaker) score += 20;
  else if (ctx.isManagement) score += 10;

  if (lead.email) score += 10;
  if (lead.phone) score += 5;
  if (lead.linkedinUrl) score += 5;
  if (lead.companyWebsite) score += 5;

  if (typeof lead.classificationConfidence === 'number') {
    score += Math.round(lead.classificationConfidence * 10);
  }

  return Math.min(100, Math.max(0, score));
}

function getPriority(score) {
  if (score >= HOT_THRESHOLD) return 'HOT';
  if (score >= WARM_THRESHOLD) return 'WARM';
  return 'COLD';
}

/** Recommend the next sales action. */
function getRecommendedAction(ctx, priority) {
  const isPartner = ctx.category === CHANNEL_PARTNER;

  if (priority === 'HOT') {
    return isPartner ? 'Contact partner for collaboration discussion' : 'Contact decision maker directly';
  }
  if (priority === 'WARM') {
    return isPartner ? 'Research partner network and start outreach' : 'Research account and prepare personalized outreach';
  }
  if (ctx.subCategory === 'restaurant') {
    return 'Collect more restaurant context before outreach';
  }
  return 'Continue lead research';
}

/** Generate the complete intelligence object. */
function analyzeLead(lead) {
  const ctx = normalizedContext(lead);
  const signalData = detectLeadSignals(lead, ctx);
  const priorityScore = calculatePriorityScore(lead, ctx);
  const priority = getPriority(priorityScore);

  return {
    ...signalData,
    priorityScore,
    priority,
    recommendedAction: getRecommendedAction(ctx, priority),
    aiEvaluatedAt: new Date().toISOString(),
  };
}

module.exports = {
  analyzeLead,
};
