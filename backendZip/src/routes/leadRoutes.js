const express = require('express');

const {
  searchLeads,
  enrichLead,
  findEmail,
  verifyEmail,
  searchCompanies,
} = require('../services/leadService');

const providerFactory = require('../services/providerFactory');
const leadRepository = require('../repositories/leadRepository');

const router = express.Router();

/**
 * Convert unknown errors into a safe API error response.
 *
 * Provider/API keys and sensitive response data are never exposed.
 */
function handleError(res, error, fallbackMessage = 'Request failed.') {
  const statusCode =
    Number(error?.statusCode) ||
    Number(error?.status) ||
    500;

  const safeStatus =
    statusCode >= 400 && statusCode <= 599
      ? statusCode
      : 500;

  const code =
    error?.code ||
    'PROVIDER_ERROR';

  let message =
    error?.message ||
    fallbackMessage;

  // Avoid leaking raw API credentials or provider internals.
  message = String(message)
    .replace(/x-api-key/gi, 'API key')
    .replace(/api[_ -]?key/gi, 'API key');

  return res.status(safeStatus).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}

/**
 * Validate a provider name before passing it into the service layer.
 */
function validateProvider(provider) {
  if (!provider || typeof provider !== 'string') {
    return {
      valid: false,
      message: 'Provider is required.',
    };
  }

  return {
    valid: true,
    provider: provider.trim().toLowerCase(),
  };
}

/**
 * GET /api/crm/health
 *
 * Health check endpoint that returns provider configuration status.
 */
router.get('/crm/health', async (req, res) => {
  try {
    const providers = {};

    // Check each provider's configuration
    const providerNames = ['prospeo', 'hunter', 'apollo'];

    for (const providerName of providerNames) {
      try {
        const provider = providerFactory.getProvider(providerName);
        providers[providerName] = {
          configured: typeof provider.isConfigured === 'function' 
            ? Boolean(provider.isConfigured()) 
            : true,
        };
      } catch (error) {
        providers[providerName] = {
          configured: false,
          error: 'Failed to load provider',
        };
      }
    }

    return res.json({
      success: true,
      providers,
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Health check failed.'
    );
  }
});

/**
 * POST /api/leads/search
 *
 * Search people/leads through the selected provider.
 *
 * Example:
 * {
 *   "provider": "apollo",
 *   "filters": {
 *     "job_title": "General Manager",
 *     "location": "India",
 *     "industry": "hospitality"
 *   },
 *   "page": 1
 * }
 */
router.post('/leads/search', async (req, res) => {
  try {
    const body = req.body || {};

    const providerValidation =
      validateProvider(body.provider);

    if (!providerValidation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROVIDER',
          message: providerValidation.message,
        },
      });
    }

    const provider = providerValidation.provider;

    const filters =
      body.filters &&
        typeof body.filters === 'object'
        ? body.filters
        : {};

    const page =
      Number.isInteger(Number(body.page)) &&
        Number(body.page) > 0
        ? Number(body.page)
        : 1;

    const result = await searchLeads(
      provider,
      filters,
      page
    );

    return res.json({
      success: true,
      provider,
      data: result.data,
      items: result.items || result.data?.items || [],
      leads: result.leads || result.data?.leads || [],
      total: result.total ?? result.data?.total ?? 0,
      page: result.page ?? result.data?.page ?? page,
      perPage:
        result.perPage ??
        result.data?.perPage ??
        undefined,
      saved: result.saved ?? 0,
      duplicates: result.duplicates ?? 0,
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Lead search failed.'
    );
  }
});

/**
 * POST /api/leads/enrich
 *
 * Enrich a single person through the selected provider.
 *
 * Apollo can use its person ID returned by search:
 *
 * {
 *   "provider": "apollo",
 *   "id": "..."
 * }
 *
 * Or fallback matching information:
 *
 * {
 *   "provider": "apollo",
 *   "firstName": "John",
 *   "lastName": "Doe",
 *   "companyWebsite": "example.com",
 *   "linkedinUrl": "..."
 * }
 */
router.post('/leads/enrich', async (req, res) => {
  try {
    const body = req.body || {};

    const providerValidation =
      validateProvider(body.provider);

    if (!providerValidation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROVIDER',
          message: providerValidation.message,
        },
      });
    }

    const provider = providerValidation.provider;

    const id =
      typeof body.id === 'string'
        ? body.id.trim()
        : '';

    const firstName =
      typeof body.firstName === 'string'
        ? body.firstName.trim()
        : typeof body.first_name === 'string'
          ? body.first_name.trim()
          : '';

    const lastName =
      typeof body.lastName === 'string'
        ? body.lastName.trim()
        : typeof body.last_name === 'string'
          ? body.last_name.trim()
          : '';

    const companyWebsite =
      typeof body.companyWebsite === 'string'
        ? body.companyWebsite.trim()
        : typeof body.company_website === 'string'
          ? body.company_website.trim()
          : typeof body.domain === 'string'
            ? body.domain.trim()
            : '';

    const email =
      typeof body.email === 'string'
        ? body.email.trim()
        : '';

    const linkedinUrl =
      typeof body.linkedinUrl === 'string'
        ? body.linkedinUrl.trim()
        : typeof body.linkedin_url === 'string'
          ? body.linkedin_url.trim()
          : '';

    /*
     * At least one useful Apollo matching identifier is required.
     *
     * An Apollo person ID is preferred because it comes directly from
     * the previous Apollo search result.
     */
    if (
      !id &&
      !email &&
      !linkedinUrl &&
      (!firstName || !lastName || !companyWebsite)
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ENRICHMENT_INPUT',
          message:
            'Provide a person id, email, LinkedIn URL, or first name + last name + company website.',
        },
      });
    }

    const result = await enrichLead(
      provider,
      {
        id,
        firstName,
        lastName,
        companyWebsite,
        email,
        linkedinUrl,
      }
    );

    return res.json({
      success: true,
      provider,
      data: result.data,
      lead: result.lead || result.data?.lead,
      matched:
        result.matched ??
        result.data?.matched ??
        true,
      saved:
        result.saved ??
        result.data?.saved ??
        false,
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Lead enrichment failed.'
    );
  }
});

/**
 * POST /api/leads/find-email
 *
 * Existing email-finder functionality.
 */
router.post('/leads/find-email', async (req, res) => {
  try {
    const body = req.body || {};

    const providerValidation =
      validateProvider(body.provider);

    if (!providerValidation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROVIDER',
          message: providerValidation.message,
        },
      });
    }

    const provider = providerValidation.provider;

    const result = await findEmail(
      provider,
      body
    );

    return res.json({
      success: true,
      provider,
      data: result?.data ?? result,
      ...(
        result &&
          typeof result === 'object' &&
          !Array.isArray(result)
          ? result
          : {}
      ),
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Email finding failed.'
    );
  }
});

/**
 * POST /api/leads/verify-email
 *
 * Existing email verification functionality.
 */
router.post('/leads/verify-email', async (req, res) => {
  try {
    const body = req.body || {};

    const providerValidation =
      validateProvider(body.provider);

    if (!providerValidation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROVIDER',
          message: providerValidation.message,
        },
      });
    }

    const provider = providerValidation.provider;

    const result = await verifyEmail(
      provider,
      body
    );

    return res.json({
      success: true,
      provider,
      data: result?.data ?? result,
      ...(
        result &&
          typeof result === 'object' &&
          !Array.isArray(result)
          ? result
          : {}
      ),
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Email verification failed.'
    );
  }
});

/**
 * POST /api/companies/search
 *
 * Search companies through the selected provider.
 */
router.post('/companies/search', async (req, res) => {
  try {
    const body = req.body || {};

    const providerValidation =
      validateProvider(body.provider);

    if (!providerValidation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROVIDER',
          message: providerValidation.message,
        },
      });
    }

    const provider = providerValidation.provider;

    const filters =
      body.filters &&
        typeof body.filters === 'object'
        ? body.filters
        : {};

    const page =
      Number.isInteger(Number(body.page)) &&
        Number(body.page) > 0
        ? Number(body.page)
        : 1;

    const result = await searchCompanies(
      provider,
      filters,
      page
    );

    return res.json({
      success: true,
      provider,
      data: result?.data ?? result,
      ...(
        result &&
          typeof result === 'object' &&
          !Array.isArray(result)
          ? result
          : {}
      ),
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Company search failed.'
    );
  }
});

/**
 * GET /api/providers/:provider/account
 *
 * Return provider account/configuration information when supported.
 *
 * This route deliberately does not expose API keys.
 */
router.get('/providers/:provider/account', async (req, res) => {
  try {
    const providerName =
      String(req.params.provider || '')
        .trim()
        .toLowerCase();

    const providerValidation =
      validateProvider(providerName);

    if (!providerValidation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROVIDER',
          message: providerValidation.message,
        },
      });
    }

    let provider;

    try {
      provider =
        providerFactory.getProvider(providerName);
    } catch (error) {
      return handleError(
        res,
        error,
        'Unable to load provider.'
      );
    }

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_PROVIDER',
          message:
            `Unsupported provider: ${providerName}`,
        },
      });
    }

    /*
     * Some providers expose an account method.
     * If they do not, return safe configuration information.
     */
    if (
      typeof provider.getAccount === 'function'
    ) {
      const account =
        await provider.getAccount();

      return res.json({
        success: true,
        provider: providerName,
        data: account,
      });
    }

    if (
      typeof provider.getAccountInfo === 'function'
    ) {
      const account =
        await provider.getAccountInfo();

      return res.json({
        success: true,
        provider: providerName,
        data: account,
      });
    }

    return res.json({
      success: true,
      provider: providerName,
      data: {
        configured:
          typeof provider.isConfigured === 'function'
            ? Boolean(provider.isConfigured())
            : true,
      },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Unable to retrieve provider account information.'
    );
  }
});

/**
 * PATCH /api/leads/:id/status
 *
 * Update pipeline status for an existing lead.
 */
router.patch('/leads/:id/status', async (req, res) => {
  try {
    const id =
      String(req.params.id || '').trim();

    if (!id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_LEAD_ID',
          message: 'Lead id is required.',
        },
      });
    }

    const body = req.body || {};

    const status =
      typeof body.status === 'string'
        ? body.status.trim()
        : '';

    if (!status) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: 'Lead status is required.',
        },
      });
    }

    const updated =
      await leadRepository.updateStatus(
        id,
        status
      );

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'LEAD_NOT_FOUND',
          message: 'Lead not found.',
        },
      });
    }

    return res.json({
      success: true,
      data: updated,
      lead: updated,
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Failed to update lead status.'
    );
  }
});

module.exports = router;