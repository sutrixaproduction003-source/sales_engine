const express = require('express');

const leadService = require('../services/leadService');
const providerFactory = require('../services/providerFactory');
const leadRepository = require('../repositories/leadRepository');
const { asyncHandler, createError } = require('../utils/errors');

const router = express.Router();

const DOMAIN_PATTERN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First non-empty trimmed string among the given body keys. */
function readString(body, ...keys) {
  for (const key of keys) {
    if (typeof body[key] === 'string' && body[key].trim()) return body[key].trim();
  }
  return '';
}

function readFilters(body) {
  return body.filters && typeof body.filters === 'object' ? body.filters : {};
}

function readPage(body) {
  const page = Number(body.page);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * Require a provider name in the body (or `:provider` param) and expose it,
 * normalized, as `req.provider`.
 */
function requireProvider(req, res, next) {
  const raw = req.params.provider ?? req.body?.provider;
  if (!raw || typeof raw !== 'string') {
    return next(createError('Provider is required.', 'INVALID_PROVIDER', 400));
  }
  req.provider = providerFactory.normalizeProviderName(raw);
  return next();
}

/**
 * Respond with a provider result, exposing its fields both under `data` and
 * at the top level (the shape existing clients read).
 */
function sendProviderResult(res, provider, result) {
  const spread = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  return res.json({ success: true, provider, data: result?.data ?? result, ...spread });
}

/**
 * GET /api/crm/health — provider configuration status.
 */
router.get('/crm/health', (req, res) => {
  res.json({ success: true, providers: providerFactory.getProviderStatuses() });
});

/**
 * POST /api/leads/search — search people through the selected provider.
 *
 * { "provider": "apollo", "filters": { "job_title": "General Manager", "location": "India" }, "page": 1 }
 */
router.post(
  '/leads/search',
  requireProvider,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const page = readPage(body);
    const result = await leadService.searchLeads(req.provider, readFilters(body), page);

    res.json({
      success: true,
      provider: req.provider,
      data: result.data,
      items: result.items,
      leads: result.leads,
      total: result.total,
      page: result.page ?? page,
      perPage: result.perPage,
      saved: result.saved,
      duplicates: result.duplicates,
    });
  })
);

/**
 * POST /api/leads/enrich — enrich a single person.
 *
 * Accepts a provider person id (preferred, e.g. from Apollo search), an email,
 * a LinkedIn URL, or first name + last name + company website.
 */
router.post(
  '/leads/enrich',
  requireProvider,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const input = {
      id: readString(body, 'id'),
      firstName: readString(body, 'firstName', 'first_name'),
      lastName: readString(body, 'lastName', 'last_name'),
      companyWebsite: readString(body, 'companyWebsite', 'company_website', 'domain'),
      email: readString(body, 'email'),
      linkedinUrl: readString(body, 'linkedinUrl', 'linkedin_url'),
    };

    const hasName = input.firstName && input.lastName && input.companyWebsite;
    if (!input.id && !input.email && !input.linkedinUrl && !hasName) {
      throw createError(
        'Provide a person id, email, LinkedIn URL, or first name + last name + company website.',
        'INVALID_ENRICHMENT_INPUT',
        400
      );
    }

    const result = await leadService.enrichLead(req.provider, input);

    res.json({
      success: true,
      provider: req.provider,
      data: result.data,
      lead: result.lead,
      matched: result.matched,
      saved: result.saved,
    });
  })
);

/**
 * POST /api/leads/find-email (alias: /api/leads/email-finder)
 * Kept as a stub: no configured provider implements it yet, so it returns
 * 400 PROVIDER_CAPABILITY_UNSUPPORTED.
 *
 * { "provider": "apollo", "firstName": "John", "lastName": "Doe", "domain": "example.com" }
 */
router.post(
  ['/leads/find-email', '/leads/email-finder'],
  requireProvider,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const input = {
      firstName: readString(body, 'firstName', 'first_name'),
      lastName: readString(body, 'lastName', 'last_name'),
      domain: readString(body, 'domain', 'companyWebsite', 'company_website'),
    };

    if (!input.firstName || !input.lastName || !DOMAIN_PATTERN.test(input.domain)) {
      throw createError('Provide firstName, lastName and a valid domain.', 'INVALID_EMAIL_FINDER_INPUT', 400);
    }

    sendProviderResult(res, req.provider, await leadService.findEmail(req.provider, input));
  })
);

/**
 * POST /api/leads/verify-email (alias: /api/leads/email-verify)
 * Kept as a stub (see find-email).
 *
 * { "provider": "apollo", "email": "john@example.com" }
 */
router.post(
  ['/leads/verify-email', '/leads/email-verify'],
  requireProvider,
  asyncHandler(async (req, res) => {
    const email = readString(req.body || {}, 'email');

    if (!EMAIL_PATTERN.test(email)) {
      throw createError('Provide a valid email address.', 'INVALID_EMAIL', 400);
    }

    sendProviderResult(res, req.provider, await leadService.verifyEmail(req.provider, { email }));
  })
);

/**
 * POST /api/companies/search — search companies through the selected provider.
 */
router.post(
  '/companies/search',
  requireProvider,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const result = await leadService.searchCompanies(req.provider, readFilters(body), readPage(body));
    sendProviderResult(res, req.provider, result);
  })
);

/**
 * GET /api/providers/:provider/account — provider account information.
 * Never exposes API keys.
 */
router.get(
  '/providers/:provider/account',
  requireProvider,
  asyncHandler(async (req, res) => {
    const provider = providerFactory.getProvider(req.provider);

    const data =
      provider.isConfigured() && provider.supports('getAccountInformation')
        ? await provider.getAccountInformation()
        : { configured: provider.isConfigured() };

    res.json({ success: true, provider: req.provider, data });
  })
);

/**
 * PATCH /api/leads/:id/status — update the pipeline status of a stored lead.
 */
router.patch('/leads/:id/status', (req, res) => {
  const id = String(req.params.id || '').trim();
  const status = readString(req.body || {}, 'status').toUpperCase();

  if (!leadRepository.LEAD_STATUSES.includes(status)) {
    throw createError(
      `Lead status must be one of: ${leadRepository.LEAD_STATUSES.join(', ')}.`,
      'INVALID_STATUS',
      400
    );
  }

  const updated = leadRepository.updateStatus(id, status);
  if (!updated) {
    throw createError('Lead not found.', 'LEAD_NOT_FOUND', 404);
  }

  res.json({ success: true, data: updated, lead: updated });
});

module.exports = router;
