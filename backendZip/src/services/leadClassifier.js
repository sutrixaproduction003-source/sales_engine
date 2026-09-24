/**
 * Sales Engine Lead Classifier
 *
 * Deterministically classifies discovered leads into the Sales Engine's
 * channel-partner and direct-customer sub-categories.
 */

const { isValidLeadSubCategory, getCategoryForSubCategory } = require('../config/leadCategories');

const UNKNOWN = Object.freeze({
  category: null,
  subCategory: null,
  classificationConfidence: null,
  classificationReason: null,
});

/**
 * Rules are evaluated in order; the first match wins. A rule matches when any
 * keyword is a substring of the corresponding lead field. `any` is matched
 * against all fields joined together with punctuation stripped.
 */
const RULES = [
  // Channel partners
  {
    subCategory: 'hotel_consultant',
    confidence: 0.96,
    reason: 'Strong hotel or hospitality consulting signal.',
    jobTitle: [
      'hotel consultant',
      'hospitality consultant',
      'hospitality advisor',
      'hotel advisory',
      'hospitality advisory',
      'hotel consulting',
      'hospitality consulting',
    ],
    companyName: ['hotel consultant', 'hospitality consultant', 'hospitality advisory', 'hotel advisory', 'hospitality consulting'],
  },
  {
    subCategory: 'wedding_event_manager',
    confidence: 0.95,
    reason: 'Strong wedding or event-management signal.',
    jobTitle: [
      'wedding planner',
      'wedding manager',
      'event manager',
      'event planner',
      'event coordinator',
      'wedding coordinator',
      'destination wedding',
      'wedding consultant',
    ],
    companyName: ['wedding planner', 'wedding events', 'event management', 'event planner', 'wedding'],
  },
  {
    subCategory: 'fb_consultant',
    confidence: 0.95,
    reason: 'Strong food and beverage consulting signal.',
    jobTitle: [
      'f&b consultant',
      'food and beverage consultant',
      'food beverage consultant',
      'restaurant consultant',
      'restaurant consulting',
      'f&b advisory',
      'food service consultant',
      'hospitality f&b consultant',
    ],
    companyName: ['f&b consultant', 'food and beverage consultant', 'restaurant consultant', 'restaurant consulting'],
  },
  {
    subCategory: 'fb_supplier',
    confidence: 0.93,
    reason: 'Strong food, beverage or hospitality supplier signal.',
    jobTitle: [
      'food supplier',
      'beverage supplier',
      'f&b supplier',
      'food distributor',
      'beverage distributor',
      'hospitality supplier',
      'restaurant supplier',
      'kitchen equipment supplier',
    ],
    companyName: [
      'food supplier',
      'beverage supplier',
      'food distributor',
      'beverage distributor',
      'hospitality supplier',
      'restaurant supplier',
      'kitchen equipment',
    ],
    industry: ['food distribution', 'food wholesale', 'beverage distribution', 'food service'],
  },
  {
    subCategory: 'training_institute',
    confidence: 0.9,
    reason: 'Hospitality training or education signal detected.',
    jobTitle: [
      'training institute',
      'training manager',
      'hospitality trainer',
      'hospitality training',
      'hospitality educator',
      'faculty hospitality',
      'hospitality professor',
      'placement officer',
    ],
    companyName: [
      'hotel management institute',
      'hospitality institute',
      'hospitality academy',
      'hotel management college',
      'hospitality school',
      'hotel school',
      'training institute',
    ],
    industry: ['education', 'hospitality education', 'training'],
  },

  // Direct customers
  {
    subCategory: 'service_apartment',
    confidence: 0.96,
    reason: 'Strong serviced-apartment or extended-stay property signal.',
    any: ['service apartment', 'serviced apartment', 'serviced apartments', 'extended stay', 'aparthotel'],
  },
  {
    subCategory: 'spa',
    confidence: 0.92,
    reason: 'Strong spa or wellness business signal.',
    jobTitle: ['spa manager', 'spa director', 'spa owner', 'wellness manager', 'wellness director', 'wellness owner'],
    companyName: ['spa', 'wellness', 'ayurveda', 'wellness resort'],
    industry: ['spa', 'wellness', 'health wellness'],
  },
  {
    subCategory: 'restaurant',
    confidence: 0.93,
    reason: 'Strong restaurant or food-service business signal.',
    jobTitle: [
      'restaurant manager',
      'restaurant director',
      'restaurant owner',
      'restaurant general manager',
      'food and beverage manager',
      'f&b manager',
      'f&b director',
      'restaurant operations',
      'restaurant operations manager',
      'outlet manager',
      'cafe manager',
      'cafe owner',
      'bar manager',
    ],
    companyName: ['restaurant', 'restaurants', 'cafe', 'coffee house', 'bistro', 'dining', 'qsr'],
    industry: ['restaurants', 'food & beverages', 'food and beverages', 'food service'],
  },
  {
    subCategory: 'resort',
    confidence: 0.94,
    reason: 'Strong resort property signal.',
    jobTitle: ['resort manager', 'resort director', 'resort general manager', 'resort owner', 'resort operations'],
    companyName: ['resort', 'resorts'],
    industry: ['resorts', 'resort', 'hospitality resort'],
  },
  {
    subCategory: 'hotel',
    confidence: 0.91,
    reason: 'Strong hotel or hospitality-property signal.',
    jobTitle: [
      'hotel manager',
      'hotel director',
      'hotel general manager',
      'hotel owner',
      'hotel operations',
      'hotel operations manager',
      'rooms division manager',
      'front office manager',
      'front office director',
      'hotel revenue manager',
      'revenue manager',
      'hotel sales manager',
      'hotel director of sales',
      'director of rooms',
    ],
    companyName: ['hotel', 'hotels', 'inn', 'lodge', 'boutique hotel', 'heritage hotel'],
    industry: ['hospitality', 'hotels', 'hotel', 'lodging', 'accommodation', 'travel accommodation'],
  },
];

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const containsAny = (text, keywords = []) => keywords.some((keyword) => text.includes(keyword));

function createResult({ subCategory, confidence, reason }) {
  if (!isValidLeadSubCategory(subCategory)) return { ...UNKNOWN };

  return {
    category: getCategoryForSubCategory(subCategory),
    subCategory,
    classificationConfidence: confidence,
    classificationReason: reason,
  };
}

/**
 * Classify a lead using available business/person information. Returns all
 * nulls when the evidence is insufficient.
 */
function classifyLead(lead = {}) {
  const fields = {
    jobTitle: normalizeText(lead.jobTitle ?? lead.job_title ?? lead.title),
    companyName: normalizeText(lead.companyName ?? lead.company_name ?? lead.organization?.name),
    industry: normalizeText(lead.industry ?? lead.organization?.industry),
  };
  const companyWebsite = normalizeText(
    lead.companyWebsite ?? lead.company_website ?? lead.website ?? lead.organization?.domain
  );

  fields.any = [fields.jobTitle, fields.companyName, fields.industry, companyWebsite]
    .filter(Boolean)
    .join(' ')
    .replace(/[^a-z0-9]+/g, ' ');

  const match = RULES.find((rule) =>
    ['jobTitle', 'companyName', 'industry', 'any'].some((field) => containsAny(fields[field], rule[field]))
  );

  return match ? createResult(match) : { ...UNKNOWN };
}

module.exports = {
  classifyLead,
};
