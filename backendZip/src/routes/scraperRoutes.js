const express = require('express');
const { scrape, SCRAPERS } = require('../services/apifyScrapers');
const { asyncHandler, createError } = require('../utils/errors');

const router = express.Router();

router.post(
  '/scrapers',
  asyncHandler(async (req, res) => {
    const { type, ...input } = req.body || {};
    const scraper = SCRAPERS[type];

    if (!scraper) {
      throw createError('Unsupported scraper type.', 'UNSUPPORTED_SCRAPER', 400);
    }

    const missing = scraper.required.filter((field) => typeof input[field] !== 'string' || !input[field].trim());
    if (missing.length) {
      throw createError(`Missing: ${missing.join(', ')}.`, 'INVALID_SCRAPER_INPUT', 400);
    }

    try {
      const items = await scrape(type, input);
      res.json({ success: true, type, count: items.length, items });
    } catch (error) {
      const status = error.code === 'SCRAPER_NOT_CONFIGURED' ? 503 : 502;
      throw createError(error.message, error.code || 'SCRAPER_FAILED', status);
    }
  })
);

module.exports = router;
