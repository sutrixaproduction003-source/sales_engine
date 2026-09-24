const express = require('express');
const providerFactory = require('../services/providerFactory');
const { asyncHandler, createError } = require('../utils/errors');

const router = express.Router();
const apollo = () => providerFactory.getProvider('apollo');

const MAX_PHONE_CHECKS = 50;
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const list = (value) => (Array.isArray(value) ? value : [value]).map(text).filter(Boolean);

/**
 * POST /api/apollo/search — find people in Apollo's database (0 credits):
 * in a location, or at a company (by website domain).
 *
 * { "location": "Chennai, India", "titles": ["Medical Director"], "keywords": "hospital", "page": 1 }
 * { "domain": "miot.in", "titles": [...], "seniorities": ["owner", "c_suite", "director"] }
 * → { people: [{ id, firstName, lastName (obfuscated), jobTitle, companyName, has_email, has_phone }], total }
 */
router.post(
  '/apollo/search',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const locations = list(body.location);
    const domain = text(body.domain);
    if (!locations.length && !domain) throw createError('A location or company domain is required.', 'INVALID_SEARCH_INPUT', 400);

    const result = await apollo().searchPeople(
      {
        locations,
        domain,
        jobTitles: list(body.titles),
        seniorities: list(body.seniorities),
        keywords: text(body.keywords),
        perPage: Number(body.perPage) || 25,
      },
      Number(body.page) || 1
    );
    res.json({ success: true, people: result.data.items, total: result.data.total, page: result.data.page });
  })
);

/**
 * POST /api/apollo/reveal — full name, work email and LinkedIn for one person
 * (1 credit), optionally requesting their mobile number (up to 8 credits,
 * delivered later: poll with POST /api/apollo/phones).
 *
 * { "id": "<apollo id>" } or { "firstName", "lastName", "companyWebsite" | "organizationName" }, plus "revealPhone": true
 * → { matched, lead, phoneRequestId }
 */
router.post(
  '/apollo/reveal',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const result = await apollo().enrichPerson({
      id: text(body.id),
      firstName: text(body.firstName),
      lastName: text(body.lastName),
      companyWebsite: text(body.companyWebsite),
      organizationName: text(body.organizationName),
      linkedinUrl: text(body.linkedinUrl),
      email: text(body.email),
      revealPhone: body.revealPhone === true,
    });
    res.json({ success: true, ...result.data });
  })
);

/**
 * POST /api/apollo/phones — collect requested mobile numbers (0 credits).
 *
 * { "requestIds": ["1039995589705121900", …] } → { results: { [requestId]: { status, phone, phones } } }
 */
router.post(
  '/apollo/phones',
  asyncHandler(async (req, res) => {
    const ids = [...new Set(list(req.body?.requestIds))].slice(0, MAX_PHONE_CHECKS);
    const results = {};
    for (const id of ids) {
      try {
        results[id] = await apollo().getPhoneResult(id);
      } catch (error) {
        if (error.statusCode === 401 || error.statusCode === 403 || error.code === 'PROVIDER_NOT_CONFIGURED') throw error;
        results[id] = { status: 'failed', reason: error.message };
      }
    }
    res.json({ success: true, results });
  })
);

module.exports = router;
