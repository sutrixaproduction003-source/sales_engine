const providerFactory = require('./providerFactory');
const leadRepository = require('../repositories/leadRepository');
const { classifyLead } = require('./leadClassifier');
const { analyzeLead } = require('./leadIntelligence');

const {
  isValidLeadCategory,
  isValidLeadSubCategory,
  getCategoryForSubCategory,
} = require('../config/leadCategories');

/**
 * Convert provider-specific lead data into the common Sales Engine lead shape.
 *
 * The providers are responsible for talking to their APIs and returning
 * normalized data. This function provides one final normalization layer
 * before persistence/response.
 */
function normalizeLead(lead, providerName, searchFilters = {}) {
  if (!lead || typeof lead !== 'object') {
    return null;
  }

  const firstName =
    lead.firstName ??
    lead.first_name ??
    '';

  const lastName =
    lead.lastName ??
    lead.last_name ??
    lead.last_name_obfuscated ??
    '';

  const fullName =
    lead.fullName ??
    lead.full_name ??
    [firstName, lastName].filter(Boolean).join(' ').trim();

  const companyName =
    lead.companyName ??
    lead.company_name ??
    lead.organization?.name ??
    '';

  const companyWebsite =
    lead.companyWebsite ??
    lead.company_website ??
    lead.organization?.domain ??
    lead.organization?.url ??
    '';

  const email =
    lead.email ??
    '';

  const emailStatus =
    lead.emailStatus ??
    lead.email_status ??
    '';

  const phone =
    lead.phone ??
    lead.phoneNumber ??
    lead.phone_number ??
    '';

  const linkedinUrl =
    lead.linkedinUrl ??
    lead.linkedin_url ??
    '';

  const linkedinCompanyUrl =
    lead.linkedinCompanyUrl ??
    lead.linkedin_company_url ??
    lead.organization?.linkedin_url ??
    '';

  const linkedinAvailable =
    typeof lead.linkedinAvailable === 'boolean'
      ? lead.linkedinAvailable
      : Boolean(linkedinUrl);

  const linkedinSource =
    lead.linkedinSource ??
    lead.linkedin_source ??
    (linkedinUrl ? lead.source ?? providerName ?? null : null);

  const jobTitle =
    lead.jobTitle ??
    lead.job_title ??
    lead.title ??
    null;

  const industry =
    lead.industry ??
    lead.organization?.industry ??
    '';

  const location =
    lead.location ??
    lead.city ??
    '';

  const latitude =
    lead.latitude ??
    lead.lat ??
    null;

  const longitude =
    lead.longitude ??
    lead.lng ??
    null;

  /*
   * ---------------------------------------------------------
   * LEAD CLASSIFICATION
   * ---------------------------------------------------------
   *
   * If a valid classification already exists, preserve it.
   * Otherwise automatically classify the lead using the
   * deterministic Sales Engine classifier.
   */

  let category =
    lead.category ??
    null;

  let subCategory =
    lead.subCategory ??
    lead.sub_category ??
    null;

  let classificationConfidence =
    lead.classificationConfidence ??
    lead.classification_confidence ??
    null;

  let classificationReason =
    lead.classificationReason ??
    lead.classification_reason ??
    null;

  // Validate an explicitly supplied category.
  if (category && !isValidLeadCategory(category)) {
    category = null;
  }

  // Validate an explicitly supplied sub-category.
  if (subCategory && !isValidLeadSubCategory(subCategory)) {
    subCategory = null;
  }

  // If sub-category exists but parent category does not,
  // derive the parent category automatically.
  if (!category && subCategory) {
    category = getCategoryForSubCategory(subCategory);
  }

  /*
   * If classification is still missing, run the classifier.
   */
  if (!category || !subCategory) {
    const classification = classifyLead({
      ...lead,
      firstName,
      lastName,
      fullName,
      companyName,
      companyWebsite,
      jobTitle,
      industry: [industry, searchFilters.industry]
        .filter(Boolean)
        .join(' '),
      location,
    });

    if (classification) {
      category =
        category ??
        classification.category ??
        null;

      subCategory =
        subCategory ??
        classification.subCategory ??
        null;

      classificationConfidence =
        classificationConfidence ??
        classification.classificationConfidence ??
        null;

      classificationReason =
        classificationReason ??
        classification.classificationReason ??
        null;
    }
  }
  // Analyze the lead for sales intelligence.
  const intelligence = analyzeLead({
    ...lead,
    category,
    subCategory,
    classificationConfidence,
  });

  lead.priorityScore = intelligence.priorityScore;
  lead.priority = intelligence.priority;
  lead.recommendedAction = intelligence.recommendedAction;
  lead.signals = intelligence.signals;
  lead.positiveSignals = intelligence.positiveSignals;
  lead.negativeSignals = intelligence.negativeSignals;
  lead.aiEvaluatedAt = intelligence.aiEvaluatedAt;

  // Final validation after automatic classification.
  if (category && !isValidLeadCategory(category)) {
    category = null;
  }

  if (subCategory && !isValidLeadSubCategory(subCategory)) {
    subCategory = null;
  }

  if (!category && subCategory) {
    category = getCategoryForSubCategory(subCategory);
  }

  // Confidence must be between 0 and 1.
  if (classificationConfidence !== null) {
    const confidence = Number(classificationConfidence);

    classificationConfidence =
      Number.isFinite(confidence) &&
        confidence >= 0 &&
        confidence <= 1
        ? confidence
        : null;
  }

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
    emailStatus: String(emailStatus || ''),
    phone: String(phone || ''),

    linkedinUrl: String(linkedinUrl || ''),
    linkedinAvailable,
    linkedinSource,
    linkedinCompanyUrl: String(linkedinCompanyUrl || ''),

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
    latitude,
    longitude,

    // Sales Engine classification
    category,
    subCategory,
    classificationConfidence,
    classificationReason,

    source: lead.source || providerName || '',

    rawData: lead.rawData ?? lead,

    has_email:
      typeof lead.has_email === 'boolean'
        ? lead.has_email
        : Boolean(email),

    has_phone:
      typeof lead.has_phone === 'boolean'
        ? lead.has_phone
        : Boolean(phone),
  };
}/**
 * Extract the normalized list of items from different provider response
 * envelopes.
 */
function extractItems(result) {
  if (!result) {
    return [];
  }

  if (Array.isArray(result)) {
    return result;
  }

  if (Array.isArray(result.items)) {
    return result.items;
  }

  if (Array.isArray(result.leads)) {
    return result.leads;
  }

  if (Array.isArray(result.people)) {
    return result.people;
  }

  if (result.data) {
    if (Array.isArray(result.data)) {
      return result.data;
    }

    if (Array.isArray(result.data.items)) {
      return result.data.items;
    }

    if (Array.isArray(result.data.leads)) {
      return result.data.leads;
    }

    if (Array.isArray(result.data.people)) {
      return result.data.people;
    }
  }

  return [];
}

/**
 * Extract pagination metadata without assuming a particular provider.
 */
function extractMeta(result, fallbackPage = 1) {
  const data = result?.data && !Array.isArray(result.data)
    ? result.data
    : result || {};

  const total =
    Number(
      data.total ??
      data.total_entries ??
      data.totalEntries ??
      data.pagination?.total_entries ??
      data.pagination?.total ??
      0
    ) || 0;

  const page =
    Number(
      data.page ??
      data.pagination?.page ??
      fallbackPage
    ) || fallbackPage;

  const perPage =
    Number(
      data.perPage ??
      data.per_page ??
      data.pagination?.per_page ??
      data.pagination?.perPage ??
      0
    ) || 0;

  return {
    total,
    page,
    perPage,
  };
}

/**
 * Convert provider errors into a consistent Sales Engine error.
 */
function normalizeProviderError(error, providerName) {
  if (!error) {
    const err = new Error('Provider request failed.');
    err.code = 'PROVIDER_ERROR';
    err.provider = providerName;
    return err;
  }

  // Preserve an already-normalized provider error.
  if (error.code && error.provider) {
    return error;
  }

  const err = new Error(
    error.message ||
    `The ${providerName} provider request failed.`
  );

  err.code =
    error.code ||
    error.response?.data?.code ||
    'PROVIDER_ERROR';

  err.provider = providerName;

  if (error.statusCode) {
    err.statusCode = error.statusCode;
  } else if (error.response?.status) {
    err.statusCode = error.response.status;
  }

  err.response = error.response?.data ?? error.response;

  return err;
}

/**
 * Resolve the provider from providerFactory.
 *
 * The project already uses providerFactory so leadService remains
 * provider-agnostic.
 */
function getProvider(providerName) {
  const name = String(providerName || '').trim().toLowerCase();

  if (!name) {
    throw new Error('Provider is required.');
  }

  let provider;

  try {
    provider = providerFactory.getProvider(name);
  } catch (error) {
    throw normalizeProviderError(error, name);
  }

  if (!provider) {
    const error = new Error(
      `Unsupported provider: ${name}`
    );

    error.code = 'UNSUPPORTED_PROVIDER';
    error.provider = name;

    throw error;
  }

  return provider;
}

/**
 * Search for leads using the selected provider.
 *
 * Existing call shape:
 *   searchLeads(providerName, filters, page)
 *
 * Also accepts:
 *   searchLeads({ provider, filters, page })
 *
 * This keeps the service flexible for existing callers/tests.
 */
async function searchLeads(providerName, filters = {}, page = 1) {
  let provider;
  let resolvedProviderName;
  let resolvedFilters;
  let resolvedPage;

  if (
    providerName &&
    typeof providerName === 'object' &&
    !Array.isArray(providerName)
  ) {
    resolvedProviderName = providerName.provider;
    resolvedFilters = providerName.filters || {};
    resolvedPage = providerName.page || 1;
  } else {
    resolvedProviderName = providerName;
    resolvedFilters = filters || {};
    resolvedPage = page || 1;
  }

  provider = getProvider(resolvedProviderName);

  const providerNameNormalized = String(
    resolvedProviderName
  ).toLowerCase();

  try {
    if (typeof provider.searchPeople !== 'function') {
      const error = new Error(
        `Lead search is not supported by provider: ${providerNameNormalized}`
      );

      error.code = 'UNSUPPORTED_CAPABILITY';
      error.provider = providerNameNormalized;

      throw error;
    }

    const result = await provider.searchPeople(
      resolvedFilters,
      Number(resolvedPage) || 1
    );

    const items = extractItems(result);

    const leads = items
      .map((item) =>
        normalizeLead(item, providerNameNormalized, resolvedFilters)
      )
      .filter(Boolean);

    const meta = extractMeta(
      result,
      Number(resolvedPage) || 1
    );

    /**
     * Persist search results in the existing file-backed repository.
     *
     * Apollo search normally does not return a real email, so the repository
     * receives the lead data without inventing an email address.
     */
    let saved = 0;
    let duplicates = 0;

    if (leads.length > 0) {
      try {
        const repositoryResult =
          await leadRepository.upsertMany(leads);

        if (typeof repositoryResult === 'number') {
          saved = repositoryResult;
        } else if (repositoryResult) {
          saved =
            Number(
              repositoryResult.saved ??
              repositoryResult.inserted ??
              repositoryResult.created ??
              0
            ) || 0;

          duplicates =
            Number(
              repositoryResult.duplicates ??
              repositoryResult.existing ??
              0
            ) || 0;
        }
      } catch (error) {
        // Repository failure should not hide successful provider results.
        // Log/return zero persistence rather than fabricating counts.
        saved = 0;
        duplicates = 0;

        // Preserve repository error for callers that explicitly depend on it.
        // Search results themselves remain available.
        console.error(
          `[leadService] Failed to persist ${providerNameNormalized} search results:`,
          error
        );
      }
    }

    return {
      success: true,
      provider: providerNameNormalized,
      data: {
        items: leads,
        leads,
        total: meta.total || leads.length,
        page: meta.page,
        perPage: meta.perPage,
      },
      items: leads,
      leads,
      total: meta.total || leads.length,
      page: meta.page,
      perPage: meta.perPage,
      saved,
      duplicates,
    };
  } catch (error) {
    throw normalizeProviderError(
      error,
      providerNameNormalized
    );
  }
}

/**
 * Enrich a person using the selected provider.
 *
 * Apollo search results intentionally contain no real email address.
 * This method calls the provider's enrichment implementation so Apollo can
 * perform the enrichment only after the user requests it.
 *
 * Supported input examples:
 *
 * {
 *   provider: 'apollo',
 *   id: 'apollo-person-id'
 * }
 *
 * or:
 *
 * {
 *   provider: 'apollo',
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   companyWebsite: 'example.com'
 * }
 */
async function enrichLead(providerName, leadData = {}) {
  let resolvedProviderName;
  let input;

  if (
    providerName &&
    typeof providerName === 'object' &&
    !Array.isArray(providerName)
  ) {
    input = providerName;
    resolvedProviderName = providerName.provider;
  } else {
    input = leadData || {};
    resolvedProviderName = providerName;
  }

  const providerNameNormalized = String(
    resolvedProviderName || ''
  ).trim().toLowerCase();

  const provider = getProvider(providerNameNormalized);

  try {
    if (typeof provider.enrichPerson !== 'function') {
      const error = new Error(
        `Person enrichment is not supported by provider: ${providerNameNormalized}`
      );

      error.code = 'UNSUPPORTED_CAPABILITY';
      error.provider = providerNameNormalized;

      throw error;
    }

    const result = await provider.enrichPerson({
      id: input.id,
      firstName:
        input.firstName ??
        input.first_name ??
        '',
      lastName:
        input.lastName ??
        input.last_name ??
        '',
      companyWebsite:
        input.companyWebsite ??
        input.company_website ??
        input.domain ??
        '',
      email: input.email || '',
      linkedinUrl:
        input.linkedinUrl ??
        input.linkedin_url ??
        '',
    });

    /**
     * ApolloProvider.enrichPerson() returns:
     *
     * {
     *   data: {
     *     lead,
     *     matched
     *   }
     * }
     *
     * Other providers may return the lead directly or use `data`.
     */
    const rawLead =
      result?.data?.lead ??
      result?.lead ??
      result?.data ??
      result;

    const lead = normalizeLead(
      rawLead,
      providerNameNormalized
    );

    if (!lead) {
      const error = new Error(
        'Provider returned an empty or invalid enrichment response.'
      );

      error.code = 'INVALID_PROVIDER_RESPONSE';
      error.provider = providerNameNormalized;

      throw error;
    }

    /**
     * Persist the enriched lead.
     *
     * At this point Apollo can provide the actual email/contact information,
     * so the enriched record can now become a normal saved lead.
     */
    let saved = false;
    let repositoryResult = null;

    try {
      repositoryResult =
        await leadRepository.upsertMany([lead]);

      saved = true;
    } catch (error) {
      console.error(
        `[leadService] Failed to persist enriched ${providerNameNormalized} lead:`,
        error
      );

      saved = false;
    }

    return {
      success: true,
      provider: providerNameNormalized,
      data: {
        lead,
        matched:
          result?.data?.matched ??
          result?.matched ??
          true,
        saved,
        repository: repositoryResult,
      },
      lead,
      matched:
        result?.data?.matched ??
        result?.matched ??
        true,
      saved,
    };
  } catch (error) {
    throw normalizeProviderError(
      error,
      providerNameNormalized
    );
  }
}

/**
 * Find an email using a provider.
 *
 * This keeps the existing email-finder functionality intact.
 */
async function findEmail(providerName, input = {}) {
  let resolvedProviderName;
  let resolvedInput;

  if (
    providerName &&
    typeof providerName === 'object' &&
    !Array.isArray(providerName)
  ) {
    resolvedInput = providerName;
    resolvedProviderName = providerName.provider;
  } else {
    resolvedInput = input || {};
    resolvedProviderName = providerName;
  }

  const providerNameNormalized = String(
    resolvedProviderName || ''
  ).trim().toLowerCase();

  const provider = getProvider(providerNameNormalized);

  try {
    if (typeof provider.findEmail !== 'function') {
      const error = new Error(
        `Email finding is not supported by provider: ${providerNameNormalized}`
      );

      error.code = 'UNSUPPORTED_CAPABILITY';
      error.provider = providerNameNormalized;

      throw error;
    }

    return await provider.findEmail(resolvedInput);
  } catch (error) {
    throw normalizeProviderError(
      error,
      providerNameNormalized
    );
  }
}

/**
 * Verify an email using a provider.
 *
 * Existing Hunter functionality continues to work through this method.
 */
async function verifyEmail(providerName, input = {}) {
  let resolvedProviderName;
  let resolvedInput;

  if (
    providerName &&
    typeof providerName === 'object' &&
    !Array.isArray(providerName)
  ) {
    resolvedInput = providerName;
    resolvedProviderName = providerName.provider;
  } else {
    resolvedInput = input || {};
    resolvedProviderName = providerName;
  }

  const providerNameNormalized = String(
    resolvedProviderName || ''
  ).trim().toLowerCase();

  const provider = getProvider(providerNameNormalized);

  try {
    if (typeof provider.verifyEmail !== 'function') {
      const error = new Error(
        `Email verification is not supported by provider: ${providerNameNormalized}`
      );

      error.code = 'UNSUPPORTED_CAPABILITY';
      error.provider = providerNameNormalized;

      throw error;
    }

    return await provider.verifyEmail(resolvedInput);
  } catch (error) {
    throw normalizeProviderError(
      error,
      providerNameNormalized
    );
  }
}

/**
 * Search companies using the selected provider.
 */
async function searchCompanies(
  providerName,
  filters = {},
  page = 1
) {
  let resolvedProviderName;
  let resolvedFilters;
  let resolvedPage;

  if (
    providerName &&
    typeof providerName === 'object' &&
    !Array.isArray(providerName)
  ) {
    resolvedProviderName = providerName.provider;
    resolvedFilters = providerName.filters || {};
    resolvedPage = providerName.page || 1;
  } else {
    resolvedProviderName = providerName;
    resolvedFilters = filters || {};
    resolvedPage = page || 1;
  }

  const providerNameNormalized = String(
    resolvedProviderName || ''
  ).trim().toLowerCase();

  const provider = getProvider(providerNameNormalized);

  try {
    if (typeof provider.searchCompanies !== 'function') {
      const error = new Error(
        `Company search is not supported by provider: ${providerNameNormalized}`
      );

      error.code = 'UNSUPPORTED_CAPABILITY';
      error.provider = providerNameNormalized;

      throw error;
    }

    const result = await provider.searchCompanies(
      resolvedFilters,
      Number(resolvedPage) || 1
    );

    return result;
  } catch (error) {
    throw normalizeProviderError(
      error,
      providerNameNormalized
    );
  }
}

module.exports = {
  normalizeLead,
  searchLeads,
  enrichLead,
  findEmail,
  verifyEmail,
  searchCompanies,
};