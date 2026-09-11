const axios = require('axios');

const ACTORS = {
  instagram: 'apify~instagram-profile-scraper',
  facebook: 'apify~facebook-pages-scraper',
  googleMapsReviews: 'kaix~google-maps-reviews-scraper',
  makemytripReviews: 'krazee_kaushik~makemytrip-hotel-reviews-scraper',
  makemytripHotels: 'krazee_kaushik~makemytrip-hotels-scraper',
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function runActor(actor, input, timeoutMilliseconds = 120000) {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    const error = new Error('APIFY_TOKEN is not configured.');
    error.code = 'SCRAPER_NOT_CONFIGURED';
    throw error;
  }

  const startedAt = Date.now();
  const runResponse = await axios.post(
    `https://api.apify.com/v2/acts/${actor}/runs?token=${encodeURIComponent(token)}`,
    input,
    { timeout: 30000 }
  );
  const run = runResponse.data?.data;
  if (!run?.id || !run.defaultDatasetId) throw new Error('Apify returned an invalid run response.');

  let status = run.status;
  while (status === 'READY' || status === 'RUNNING') {
    if (Date.now() - startedAt > timeoutMilliseconds) throw new Error('Scraper timed out while waiting for Apify.');
    await sleep(3000);
    const statusResponse = await axios.get(
      `https://api.apify.com/v2/actor-runs/${run.id}?token=${encodeURIComponent(token)}`,
      { timeout: 30000 }
    );
    status = statusResponse.data?.data?.status;
  }
  if (status !== 'SUCCEEDED') throw new Error(`Apify run finished with status: ${status || 'UNKNOWN'}.`);

  const datasetResponse = await axios.get(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${encodeURIComponent(token)}`,
    { timeout: 30000 }
  );
  return Array.isArray(datasetResponse.data) ? datasetResponse.data : [];
}

async function scrape(type, input) {
  switch (type) {
    case 'instagram': return runActor(ACTORS.instagram, { usernames: [input.username] });
    case 'facebook': return runActor(ACTORS.facebook, { startUrls: [{ url: input.pageUrl }], resultsLimit: input.maxPosts || 10 });
    case 'googleMapsReviews': return runActor(ACTORS.googleMapsReviews, { startUrls: [{ url: input.placeUrl }], maxReviews: input.maxReviews || 50 });
    case 'makemytripReviews': return runActor(ACTORS.makemytripReviews, { startUrls: [{ url: input.hotelUrl }], maxItems: input.maxReviews || 20 });
    case 'makemytripHotels': return runActor(ACTORS.makemytripHotels, { startUrls: [{ url: input.searchUrl }], maxItems: input.maxItems || 20 });
    default: {
      const error = new Error(`Unsupported scraper: ${type}.`);
      error.code = 'UNSUPPORTED_SCRAPER';
      throw error;
    }
  }
}

module.exports = { scrape };