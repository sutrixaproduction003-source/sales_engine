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

function ensureToken() {
  if (!apifyToken) {
    throw createError('APIFY_TOKEN is not configured.', 'SCRAPER_NOT_CONFIGURED', 503);
  }
}

async function apify(method, path, data) {
  try {
    const response = await axios.request({
      method,
      url: `${APIFY_BASE}${path}`,
      params: { token: apifyToken },
      data,
      timeout: REQUEST_TIMEOUT_MS,
    });
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const message = error.response?.data?.error?.message || error.message;
    if (status === 401 || status === 403) {
      throw createError(`Apify rejected the token: ${message}`, 'SCRAPER_NOT_CONFIGURED', 503);
    }
    if (status === 404) {
      throw createError(`Apify resource not found: ${message}`, 'SCRAPER_RUN_NOT_FOUND', 404);
    }
    throw createError(`Apify request failed: ${message}`, 'SCRAPER_FAILED', 502);
  }
}

/** Start an actor run without waiting. Returns `{ id, status, defaultDatasetId }`. */
async function startActorRun(actor, input) {
  ensureToken();
  const run = (await apify('post', `/acts/${actor}/runs`, input))?.data;
  if (!run?.id || !run.defaultDatasetId) throw new Error('Apify returned an invalid run response.');
  return { id: run.id, status: run.status, defaultDatasetId: run.defaultDatasetId };
}

/** Current state of an actor run. */
async function getActorRun(runId) {
  ensureToken();
  const run = (await apify('get', `/actor-runs/${encodeURIComponent(runId)}`))?.data;
  if (!run?.id) throw createError('Scraper run not found.', 'SCRAPER_RUN_NOT_FOUND', 404);
  return {
    id: run.id,
    status: run.status,
    defaultDatasetId: run.defaultDatasetId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

async function getDatasetItems(datasetId) {
  ensureToken();
  const items = await apify('get', `/datasets/${encodeURIComponent(datasetId)}/items`);
  return Array.isArray(items) ? items : [];
}

/**
 * Start an Apify actor run, wait for it to finish, and return its dataset items.
 */
async function runActor(actor, input, timeoutMilliseconds = 120000) {
  const startedAt = Date.now();
  const run = await startActorRun(actor, input);

  let { status } = run;
  while (status === 'READY' || status === 'RUNNING') {
    if (Date.now() - startedAt > timeoutMilliseconds) throw new Error('Scraper timed out while waiting for Apify.');
    await sleep(POLL_INTERVAL_MS);
    status = (await getActorRun(run.id)).status;
  }
  if (status !== 'SUCCEEDED') throw new Error(`Apify run finished with status: ${status || 'UNKNOWN'}.`);

  return getDatasetItems(run.defaultDatasetId);
}

async function scrape(type, input) {
  const scraper = SCRAPERS[type];
  if (!scraper) {
    throw createError(`Unsupported scraper: ${type}.`, 'UNSUPPORTED_SCRAPER', 400);
  }
  return runActor(scraper.actor, scraper.buildInput(input));
}

module.exports = { SCRAPERS, scrape, startActorRun, getActorRun, getDatasetItems };
