const express = require('express');
const { scrape } = require('../services/apifyScrapers');

const router = express.Router();
const requiredFields = {
  instagram: ['username'],
  facebook: ['pageUrl'],
  googleMapsReviews: ['placeUrl'],
  makemytripReviews: ['hotelUrl'],
  makemytripHotels: ['searchUrl'],
};

router.post('/scrapers', async (req, res) => {
  const { type, ...input } = req.body || {};
  const missing = (requiredFields[type] || []).filter((field) => typeof input[field] !== 'string' || !input[field].trim());

  if (!requiredFields[type]) {
    return res.status(400).json({ success: false, error: { code: 'UNSUPPORTED_SCRAPER', message: 'Unsupported scraper type.' } });
  }
  if (missing.length) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_SCRAPER_INPUT', message: `Missing: ${missing.join(', ')}.` } });
  }

  try {
    const items = await scrape(type, input);
    return res.json({ success: true, type, count: items.length, items });
  } catch (error) {
    const status = error.code === 'SCRAPER_NOT_CONFIGURED' ? 503 : 502;
    return res.status(status).json({ success: false, error: { code: error.code || 'SCRAPER_FAILED', message: error.message } });
  }
});

module.exports = router;