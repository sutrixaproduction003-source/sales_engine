const express = require('express');
const { asyncHandler } = require('../utils/errors');
const { checkAccount } = require('../services/apifyScrapers');
const providerFactory = require('../services/providerFactory');
const { apifyToken } = require('../config/env');

const router = express.Router();

/** Run a check; → { status: 'ok' | 'fail' | 'not_configured', detail }. */
async function probe(configured, fn) {
  if (!configured) return { status: 'not_configured', detail: 'No key set' };
  try {
    return { status: 'ok', detail: await fn() };
  } catch (error) {
    return { status: 'fail', detail: error.message };
  }
}

/**
 * GET /api/health/live — live checks of the backend's paid services, using no
 * credits: Apify (account lookup) and Apollo (a one-result people search,
 * which is free). The Apollo key may be forwarded by the app.
 */
router.get(
  '/health/live',
  asyncHandler(async (req, res) => {
    const apollo = providerFactory.getProvider('apollo');
    const [apify, apolloResult] = await Promise.all([
      probe(Boolean(apifyToken), async () => {
        const account = await checkAccount();
        return `Signed in as ${account.username || 'unknown'}${account.plan ? ` (${account.plan} plan)` : ''}`;
      }),
      probe(apollo.isConfigured(), async () => {
        const result = await apollo.searchPeople({ locations: ['India'], jobTitles: ['CEO'], perPage: 1 }, 1);
        return `Key accepted · ${Number(result.data.total || 0).toLocaleString()} people match a test search (no credits used)`;
      }),
    ]);
    res.json({ success: true, apify, apollo: apolloResult });
  })
);

module.exports = router;
