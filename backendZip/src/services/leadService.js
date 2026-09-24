const providerFactory = require('./providerFactory');
const leadRepository = require('../repositories/leadRepository');
const logger = require('../utils/logger');
const { createError } = require('../utils/errors');
const { classifyLead } = require('./leadClassifier');
const { analyzeLead } = require('./leadIntelligence');
const {
  isValidLeadCategory,
  isValidLeadSubCategory,
  getCategoryForSubCategory,
} = require('../config/leadCategories');

/** Return the first value that is not null/undefined. */
const pick = (...values) => values.find((value) => value !== undefined && value !== null);

/**
 * Resolve category/sub-category for a lead: keep a valid supplied
 * classification, otherwise run the deterministic classifier.
 */
function resolveClassification(lead, context, searchFilters) {
  let category = pick(lead.category, null);
  let subCategory = pick(lead.subCategory, lead.sub_category, null);
  let confidence = pick(lead.classificationConfidence, lead.classification_confidence, null);
  let reason = pick(lead.classificationReason, lead.classification_reason, null);

  if (category && !isValidLeadCategory(category)) category = null;
  if (subCategory && !isValidLeadSubCategory(subCategory)) subCategory = null;
  if (!category && subCategory) category = getCategoryForSubCategory(subCategory);

  if (!category || !subCategory) {
    const classification = classifyLead({
      ...lead,
      ...context,
      industry: [context.industry, searchFilters.industry].filter(Boolean).join(' '),
    });

    category = pick(category, classification.category, null);
    subCategory = pick(subCategory, classification.subCategory, null);
    confidence = pick(confidence, classification.classificationConfidence, null);
    reason = pick(reason, classification.classificationReason, null);
  }

  if (confidence !== null) {
    const n = Number(confidence);
    confidence = Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
  }

  return { category, subCategory, classificationConfidence: confidence, classificationReason: reason };
}

/**
 * Convert provider-specific lead data into the common Sales Engine lead shape.
 *
 * Providers are responsible for talking to their APIs and returning mostly
 * normalized data; this is the final normalization layer before
 * persistence/response.
 */
function normalizeLead(lead, providerName, searchFilters = {}) {
  if (!lead || typeof lead !== 'object') {
    return null;
  }

  const firstName = pick(lead.firstName, lead.first_name, '');
  const lastName = pick(lead.lastName, lead.last_name, lead.last_name_obfuscated, '');
  const fullName = pick(lead.fullName, lead.full_name, [firstName, lastName].filter(Boolean).join(' ').trim());
  const companyName = pick(lead.companyName, lead.company_name, lead.organization?.name, '');
  const companyWebsite = pick(
    lead.companyWebsite,
    lead.company_website,
    lead.organization?.domain,
    lead.organization?.url,
    ''
  );
  const email = pick(lead.email, '');
  const phone = pick(lead.phone, lead.phoneNumber, lead.phone_number, '');
  const linkedinUrl = pick(lead.linkedinUrl, lead.linkedin_url, '');
  const jobTitle = pick(lead.jobTitle, lead.job_title, lead.title, null);
  const industry = pick(lead.industry, lead.organization?.industry, '');
  const location = pick(lead.location, lead.city, '');

  const classification = resolveClassification(
    lead,
    { firstName, lastName, fullName, companyName, companyWebsite, jobTitle, industry, location },
    searchFilters
  );

  const { signals, positiveSignals, negativeSignals, priorityScore, priority, recommendedAction, aiEvaluatedAt } =
    analyzeLead({ ...lead, ...classification });

  return {
    id: lead.id ? String(lead.id) : '',
    firstName: String(firstName || ''),
    lastName: String(lastName || ''),
    fullName: String(fullName || ''),
    jobTitle: jobTitle ? String(jobTitle) : null,

    companyName: String(companyName || ''),
    companyWebsite: String(companyWebsite || ''),
    hotelName: String(lead.hotelName || searchFilters.hotel_name || companyName || ''),
    brandType: lead.brandType || searchFilters.brand_type || null,
    propertySizeCategory: lead.propertySizeCategory || searchFilters.property_size_category || null,

    email: String(email || ''),
    emailStatus: String(pick(lead.emailStatus, lead.email_status, '') || ''),
    phone: String(phone || ''),

    linkedinUrl: String(linkedinUrl || ''),
    linkedinAvailable: typeof lead.linkedinAvailable === 'boolean' ? lead.linkedinAvailable : Boolean(linkedinUrl),
    linkedinSource: pick(
      lead.linkedinSource,
      lead.linkedin_source,
      linkedinUrl ? pick(lead.source, providerName, null) : null
    ),
    linkedinCompanyUrl: String(
      pick(lead.linkedinCompanyUrl, lead.linkedin_company_url, lead.organization?.linkedin_url, '') || ''
    ),

    industry: String(industry || ''),
    location: String(location || ''),
    city: lead.city || null,
    state: lead.state || null,
    exactAddress: lead.exactAddress || null,
    googleMapsLink: lead.googleMapsLink || null,
    googleBusinessLink: lead.googleBusinessLink || null,
    tripAdvisorLink: lead.tripAdvisorLink || null,
    bookingComLink: lead.bookingComLink || null,
    makeMyTripLink: lead.makeMyTripLink || null,
    instagramLink: lead.instagramLink || null,
    facebookLink: lead.facebookLink || null,
    googleRating: lead.googleRating ?? null,
    totalReviewsCount: lead.totalReviewsCount ?? null,
    sentimentScore: lead.sentimentScore ?? null,
    latitude: pick(lead.latitude, lead.lat, null),
    longitude: pick(lead.longitude, lead.lng, null),

    // Sales Engine classification + intelligence
    ...classification,
    priorityScore,
    priority,
    recommendedAction,
    signals,
    positiveSignals,
    negativeSignals,
    aiEvaluatedAt,

    source: lead.source || providerName || '',
    rawData: lead.rawData ?? lead,

    has_email: typeof lead.has_email === 'boolean' ? lead.has_email : Boolean(email),
    has_phone: typeof lead.has_phone === 'boolean' ? lead.has_phone : Boolean(phone),
  };
}

/**
 * Extract the list of items from the different provider response envelopes.
 */
function extractItems(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;

  for (const container of [result, result.data]) {
    if (!container) continue;
    if (Array.isArray(container)) return container;
    for (const key of ['items', 'leads', 'people']) {
      if (Array.isArray(container[key])) return container[key];
    }
  }

  return [];
}

/**
 * Extract pagination metadata without assuming a particular provider.
 */
function extractMeta(result, fallbackPage = 1) {
  const data = result?.data && !Array.isArray(result.data) ? result.data : result || {};

  return {
    total:
      Number(
        pick(data.total, data.total_entries, data.totalEntries, data.pagination?.total_entries, data.pagination?.total, 0)
      ) || 0,
    page: Number(pick(data.page, data.pagination?.page, fallbackPage)) || fallbackPage,
    perPage:
      Number(pick(data.perPage, data.per_page, data.pagination?.per_page, data.pagination?.perPage, 0)) || 0,
  };
}

/**
 * Convert provider errors into a consistent Sales Engine error.
 */
function normalizeProviderError(error, providerName) {
  if (!error) {
    return createError('Provider request failed.', 'PROVIDER_ERROR', 500, { provider: providerName });
  }

  // Preserve an already-normalized provider error.
  if (error.code && error.provider) {
    return error;
  }

  return createError(
    error.message || `The ${providerName} provider request failed.`,
    error.code || error.response?.data?.code || 'PROVIDER_ERROR',
    error.statusCode || error.response?.status,
    { provider: providerName, response: error.response?.data ?? error.response }
  );
}

/**
 * Resolve a provider and invoke one of its capabilities, normalizing errors.
 */
async function callProvider(providerName, capability, ...args) {
  const name = providerFactory.normalizeProviderName(providerName);

  try {
    const provider = providerFactory.getProvider(name);
    return await provider[capability](...args);
  } catch (error) {
    throw normalizeProviderError(error, name);
  }
}

/**
 * Persist leads, never letting a storage failure hide provider results.
 */
function persistLeads(leads, providerName) {
  try {
    return { ...leadRepository.upsertMany(leads), persisted: true };
  } catch (error) {
    logger.error('Failed to persist leads', { provider: providerName, message: error.message });
    return { leads: [], created: 0, updated: 0, persisted: false };
  }
}

/**
 * Search for leads using the selected provider and store the results.
 */
async function searchLeads(providerName, filters = {}, page = 1) {
  const name = providerFactory.normalizeProviderName(providerName);
  const requestPage = Number(page) || 1;

  const result = await callProvider(name, 'searchPeople', filters, requestPage);

  const leads = extractItems(result)
    .map((item) => normalizeLead(item, name, filters))
    .filter(Boolean);
  const meta = extractMeta(result, requestPage);
  const stored = persistLeads(leads, name);

  const data = {
    items: leads,
    leads,
    total: meta.total || leads.length,
    page: meta.page,
    perPage: meta.perPage,
  };

  return {
    provider: name,
    data,
    ...data,
    saved: stored.created,
    duplicates: stored.updated,
  };
}

/**
 * Enrich a person using the selected provider and store the enriched lead.
 *
 * Apollo search results contain no real email address; enrichment is where
 * the provider returns contact data, after the user explicitly requests it.
 */
async function enrichLead(providerName, input = {}) {
  const name = providerFactory.normalizeProviderName(providerName);

  const result = await callProvider(name, 'enrichPerson', {
    id: input.id,
    firstName: input.firstName || '',
    lastName: input.lastName || '',
    companyWebsite: input.companyWebsite || '',
    email: input.email || '',
    linkedinUrl: input.linkedinUrl || '',
  });

  // Apollo returns { data: { lead, matched } }; other providers may return
  // the lead directly or under `data`.
  const lead = normalizeLead(pick(result?.data?.lead, result?.lead, result?.data, result), name);

  if (!lead) {
    throw createError('Provider returned an empty or invalid enrichment response.', 'INVALID_PROVIDER_RESPONSE', 502, {
      provider: name,
    });
  }

  const { persisted } = persistLeads([lead], name);
  const matched = pick(result?.data?.matched, result?.matched, true);

  return {
    provider: name,
    data: { lead, matched, saved: persisted },
    lead,
    matched,
    saved: persisted,
  };
}

const findEmail = (providerName, input = {}) => callProvider(providerName, 'findEmail', input);

const verifyEmail = (providerName, input = {}) => callProvider(providerName, 'verifyEmail', input);

const searchCompanies = (providerName, filters = {}, page = 1) =>
  callProvider(providerName, 'searchCompanies', filters, Number(page) || 1);

module.exports = {
  normalizeLead,
  searchLeads,
  enrichLead,
  findEmail,
  verifyEmail,
  searchCompanies,
};
