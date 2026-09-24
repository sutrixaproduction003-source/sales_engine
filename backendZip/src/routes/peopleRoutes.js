const express = require('express');
const { startPeopleSearch, getPeopleSearch } = require('../services/peopleService');
const { asyncHandler } = require('../utils/errors');

const router = express.Router();

/**
 * POST /api/people/search — find the people at a business.
 *
 * { "business": "Taj Exotica Resort & Spa", "location": "Goa, India", "roles": ["General Manager", "Owner"] }
 * → 202 { success, jobId }
 */
router.post(
  '/people/search',
  asyncHandler(async (req, res) => {
    const { business, location, roles } = req.body || {};
    res.status(202).json({ success: true, ...(await startPeopleSearch({ business, location, roles })) });
  })
);

/**
 * GET /api/people/search/:jobId?business=…&roles=a,b — poll a search.
 * → { success, done, progress, business, people, warnings }
 */
router.get(
  '/people/search/:jobId',
  asyncHandler(async (req, res) => {
    const roles = String(req.query.roles || '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    const result = await getPeopleSearch(req.params.jobId, { business: String(req.query.business || ''), roles });
    res.json({ success: true, ...result });
  })
);

module.exports = router;
