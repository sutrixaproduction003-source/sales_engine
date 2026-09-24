const express = require('express');
const { startPlacesSearch, getPlacesSearch } = require('../services/placesService');
const { asyncHandler } = require('../utils/errors');

const router = express.Router();

/**
 * POST /api/places/search — start a Google Maps scrape.
 *
 * { "location": "Goa, India", "searchTerms": ["hotels", "resorts"], "maxPlacesPerTerm": 20 }
 * → 202 { success, runId, status }
 */
router.post(
  '/places/search',
  asyncHandler(async (req, res) => {
    const { location, searchTerms, maxPlacesPerTerm } = req.body || {};
    const run = await startPlacesSearch({ location, searchTerms, maxPlacesPerTerm });
    res.status(202).json({ success: true, ...run });
  })
);

/**
 * GET /api/places/search/:runId — poll a scrape.
 * → { success, runId, status, done, places }
 */
router.get(
  '/places/search/:runId',
  asyncHandler(async (req, res) => {
    res.json({ success: true, ...(await getPlacesSearch(req.params.runId)) });
  })
);

module.exports = router;
