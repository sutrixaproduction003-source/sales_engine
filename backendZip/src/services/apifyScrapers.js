const axios = require('axios');
const { apifyToken } = require('../config/env');
const { createError } = require('../utils/errors');

const APIFY_BASE = 'https://api.apify.com/v2';
const POLL_INTERVAL_MS = 3000;
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Supported Apify scrapers: the actor to run, required input fields, and how
 * to build the actor input from the request.
 */
const SCRAPERS = {
  instagram: {
    actor: 'apify~instagram-profile-scraper',
    required: ['username'],
    buildInput: (input) => ({ usernames: [input.username] }),
  },
  facebook: {
    actor: 'apify~facebook-pages-scraper',
    required: ['pageUrl'],
    buildInput: (input) => ({ startUrls: [{ url: input.pageUrl }], resultsLimit: input.maxPosts || 10 }),
  },
  googleMapsReviews: {
    actor: 'kaix~google-maps-reviews-scraper',
    required: ['placeUrl'],
    buildInput: (input) => ({ startUrls: [{ url: input.placeUrl }], maxReviews: input.maxReviews || 50 }),
  },
  makemytripReviews: {
    actor: 'krazee_kaushik~makemytrip-hotel-reviews-scraper',
    required: ['hotelUrl'],
    buildInput: (input) => ({ startUrls: [{ url: input.hotelUrl }], maxItems: input.maxReviews || 20 }),
  },
  makemytripHotels: {
    actor: 'krazee_kaushik~makemytrip-hotels-scraper',
    required: ['searchUrl'],
    buildInput: (input) => ({ startUrls: [{ url: input.searchUrl }], maxItems: input.maxItems || 20 }),
  },
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function apify(method, path, data) {
  const response = await axios.request({
    method,
    url: `${APIFY_BASE}${path}`,
    params: { token: apifyToken },
    data,
    timeout: REQUEST_TIMEOUT_MS,
  });
  return response.data;
}

/**
 * Start an Apify actor run, wait for it to finish, and return its dataset items.
 */
async function runActor(actor, input, timeoutMilliseconds = 120000) {
  if (!apifyToken) {
    throw createError('APIFY_TOKEN is not configured.', 'SCRAPER_NOT_CONFIGURED', 503);
  }

  const startedAt = Date.now();
  const run = (await apify('post', `/acts/${actor}/runs`, input))?.data;
  if (!run?.id || !run.defaultDatasetId) throw new Error('Apify returned an invalid run response.');

  let status = run.status;
  while (status === 'READY' || status === 'RUNNING') {
    if (Date.now() - startedAt > timeoutMilliseconds) throw new Error('Scraper timed out while waiting for Apify.');
    await sleep(POLL_INTERVAL_MS);
    status = (await apify('get', `/actor-runs/${run.id}`))?.data?.status;
  }
  if (status !== 'SUCCEEDED') throw new Error(`Apify run finished with status: ${status || 'UNKNOWN'}.`);

  const items = await apify('get', `/datasets/${run.defaultDatasetId}/items`);
  return Array.isArray(items) ? items : [];
}

async function scrape(type, input) {
  const scraper = SCRAPERS[type];
  if (!scraper) {
    throw createError(`Unsupported scraper: ${type}.`, 'UNSUPPORTED_SCRAPER', 400);
  }
  return runActor(scraper.actor, scraper.buildInput(input));
}

module.exports = { SCRAPERS, scrape };
