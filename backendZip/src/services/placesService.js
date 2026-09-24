/**
 * Google Maps place scraping (Apify "Google Maps Scraper") for location-based
 * lead discovery: "hotels in Goa" → businesses with exact coordinates,
 * address, phone, website, rating and — when contact scraping is enabled —
 * emails and social profiles found on their websites.
 *
 * Runs are asynchronous: start a run, then poll it. Scrapes routinely take
 * longer than a serverless request is allowed to live.
 *
 * Fallback: when Apify is not configured, out of credit, or a run fails, the
 * same search runs on Apollo company search when an Apollo key is set (see
 * apolloPlaces), else — or when Apollo finds nothing — on OpenStreetMap (free,
 * keyless — see osmPlaces). Fallback jobs use the same start/poll interface
 * with "fb-" run ids.
 */

const { startActorRun, getActorRun, getDatasetItems } = require('./apifyScrapers');
const { createError } = require('../utils/errors');
const { apifyScrapeContacts } = require('../config/env');
const { searchOsm, lookupOsm } = require('./osmPlaces');
const { apolloAvailable, searchApollo, lookupApollo } = require('./apolloPlaces');
const logger = require('../utils/logger');

const ACTOR = 'compass~crawler-google-places';
const DEFAULT_PLACES_PER_TERM = 20;
const MAX_PLACES_PER_TERM = 100;
const MAX_TERMS = 10;

const FINISHED_OK = 'SUCCEEDED';
const FINISHED_FAILED = ['FAILED', 'ABORTED', 'TIMED-OUT', 'TIMED_OUT'];

const cleanList = (values) =>
  [...new Set((Array.isArray(values) ? values : [values]).map((v) => String(v ?? '').trim()).filter(Boolean))];

/** Validate and build the actor input. */
function buildPlacesInput({ location, searchTerms, maxPlacesPerTerm }) {
  const locationQuery = String(location ?? '').trim();
  const terms = cleanList(searchTerms).slice(0, MAX_TERMS);

  if (!locationQuery) {
    throw createError('Location is required.', 'INVALID_PLACES_INPUT', 400);
  }
  if (terms.length === 0) {
    throw createError('At least one search term (e.g. "hotels") is required.', 'INVALID_PLACES_INPUT', 400);
  }

  const perTerm = Number(maxPlacesPerTerm);
  return {
    searchStringsArray: terms,
    locationQuery,
    maxCrawledPlacesPerSearch:
      Number.isInteger(perTerm) && perTerm > 0 ? Math.min(perTerm, MAX_PLACES_PER_TERM) : DEFAULT_PLACES_PER_TERM,
    language: 'en',
    skipClosedPlaces: true,
    scrapeContacts: apifyScrapeContacts,
  };
}

const first = (values) => (Array.isArray(values) && values.length ? String(values[0]) : null);

const GENERAL_INBOX =
  /^(info|contact|contactus|enquiry|enquiries|inquiry|inquiries|sales|marketing|business|hello|office|admin|mail|support|care|corporate|reservations?|bookings?)[\d._-]*@/i;
const NOT_FOR_SALES = /^(hr|hrd|careers?|jobs?|recruit(ment|ing)?|talent|resume|cv|hiring|noreply|no-reply|donotreply|privacy|legal|abuse|webmaster)[\d._-]*@/i;

const FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|rediffmail|icloud|proton|protonmail|zoho)\.[a-z.]+$/i;

function siteDomain(website) {
  try {
    return new URL(/^https?:/i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Same domain as the website (or free-mail): websites also list partner firms' addresses. */
function belongsToBusiness(email, website) {
  const site = siteDomain(website || '');
  if (!site) return true;
  const domain = email.split('@')[1] || '';
  return domain === site || domain.endsWith(`.${site}`) || site.endsWith(`.${domain}`) || FREE_MAIL.test(email);
}

/** The business's general inbox (info@, sales@ …), avoiding HR/careers and third-party addresses. */
function businessEmail(emails, website) {
  const list = cleanList(emails)
    .map((e) => e.toLowerCase())
    .filter((e) => belongsToBusiness(e, website));
  return (
    list.find((e) => GENERAL_INBOX.test(e) && !NOT_FOR_SALES.test(e)) ||
    list.find((e) => !NOT_FOR_SALES.test(e)) ||
    ''
  );
}

const toCoordinate = (value) => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Map one Google Maps Scraper item into the Sales Engine lead shape. */
function normalizePlace(item) {
  if (!item || typeof item !== 'object' || !item.title) return null;

  // Listings often append a slogan: "Apollo Hospitals | Best Hospital in …".
  const name = String(item.title).split(/\s+\|\s+/)[0].trim() || item.title;

  const latitude = toCoordinate(item.location?.lat);
  const longitude = toCoordinate(item.location?.lng);
  const locationText = [item.city, item.state, item.countryCode].filter(Boolean).join(', ');

  return {
    id: item.placeId ? `gmaps-${item.placeId}` : `gmaps-${name}-${latitude},${longitude}`,
    placeId: item.placeId || null,
    companyName: name,
    hotelName: name,
    fullName: '',
    industry: item.categoryName || first(item.categories) || '',
    categories: cleanList(item.categories),
    searchTerm: item.searchString || null,
    email: businessEmail(item.emails, item.website),
    emails: cleanList(item.emails)
      .map((e) => e.toLowerCase())
      .filter((e) => belongsToBusiness(e, item.website)),
    phone: item.phone || item.phoneUnformatted || '',
    companyWebsite: item.website || '',
    exactAddress: item.address || [item.street, item.city, item.postalCode].filter(Boolean).join(', '),
    location: locationText,
    city: item.city || null,
    state: item.state || null,
    country: item.countryCode || null,
    latitude,
    longitude,
    googleMapsLink: item.url || null,
    googleRating: toCoordinate(item.totalScore),
    totalReviewsCount: toCoordinate(item.reviewsCount),
    instagramLink: first(item.instagrams),
    facebookLink: first(item.facebooks),
    linkedinUrl: first(item.linkedIns) || '',
    imageUrl: item.imageUrl || null,
    source: 'google_maps',
  };
}

/** Give an OSM place the same email fields as a Google Maps place. */
function withBusinessEmail({ rawEmails, ...place }) {
  return {
    ...place,
    email: businessEmail(rawEmails, place.companyWebsite),
    emails: cleanList(rawEmails)
      .map((e) => e.toLowerCase())
      .filter((e) => belongsToBusiness(e, place.companyWebsite)),
  };
}

// ---------- fallback jobs: Apollo, then OpenStreetMap (in-process) ----------

const OSM_JOB_TTL_MS = 60 * 60 * 1000;
const osmJobs = new Map();
/** Apify run id → the search it was started for, to re-run on OSM if it fails. */
const apifyRequests = new Map();
let osmJobCount = 0;

function remember(map, key, value) {
  map.set(key, Object.assign(value, { at: Date.now() }));
  for (const [k, v] of map) if (Date.now() - v.at > OSM_JOB_TTL_MS) map.delete(k);
}

/**
 * The search on the fallback sources: Apollo when configured, OpenStreetMap
 * for everything Apollo can't provide. Sets job.source to where results came from.
 */
async function runFallback(request, job) {
  const osm = (queries) =>
    request.kind === 'lookup'
      ? lookupOsm(queries, withBusinessEmail)
      : searchOsm(
          { location: request.locationQuery, searchTerms: request.searchStringsArray, perTerm: request.maxCrawledPlacesPerSearch },
          withBusinessEmail
        );

  if (apolloAvailable()) {
    try {
      if (request.kind === 'lookup') {
        const { places, missing } = await lookupApollo(request.queries, withBusinessEmail);
        const rest = missing.length ? await osm(missing) : [];
        job.source = places.length ? 'apollo' : 'openstreetmap';
        return [...places, ...rest];
      }
      const places = await searchApollo(
        { location: request.locationQuery, searchTerms: request.searchStringsArray, perTerm: request.maxCrawledPlacesPerSearch },
        withBusinessEmail
      );
      if (places.length) {
        job.source = 'apollo';
        return places;
      }
      job.apolloNote = 'Apollo found no companies here';
    } catch (error) {
      logger.warn('Apollo fallback failed', { message: error.message });
      job.apolloNote = `Apollo failed: ${error.message}`;
    }
  }
  job.source = 'openstreetmap';
  return osm(request.queries);
}

/** Start a fallback search in the background; returns its run id. */
function startOsmJob(request, reason) {
  const runId = `fb-${Date.now().toString(36)}-${++osmJobCount}`;
  const job = {
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    reason,
    source: apolloAvailable() ? 'apollo' : 'openstreetmap',
  };
  remember(osmJobs, runId, job);
  const work = runFallback(request, job);
  work
    .then((places) => Object.assign(job, { status: 'SUCCEEDED', places }))
    .catch((error) => Object.assign(job, { status: 'FAILED', error }))
    .finally(() => (job.finishedAt = new Date().toISOString()));
  logger.info(`Places search on fallback sources (${reason})`);
  return runId;
}

function osmJobResult(runId, job) {
  if (!job) throw createError('Search expired — start it again.', 'SCRAPER_RUN_NOT_FOUND', 404);
  const base = {
    runId,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || null,
    source: job.source,
    fallbackReason: job.apolloNote ? `${job.reason} · ${job.apolloNote}` : job.reason,
  };
  if (job.status === 'FAILED') throw job.error;
  if (job.status !== FINISHED_OK) return { ...base, done: false, places: [] };
  return { ...base, done: true, places: job.places };
}

/** Why Apify can't be used, in words the UI can show. */
function fallbackReason(error) {
  if (error.code === 'SCRAPER_NOT_CONFIGURED') return 'Apify is not connected';
  if (/402|credit|usage|limit/i.test(error.message)) return 'Apify is out of credit';
  return 'Google Maps scraping failed';
}

/** Start on Apify; if Apify can't take the job, run it on OpenStreetMap. */
async function startWithFallback(input, request) {
  try {
    const run = await startActorRun(ACTOR, input);
    remember(apifyRequests, run.id, { request });
    return { runId: run.id, status: run.status, source: 'google_maps' };
  } catch (error) {
    if (error.code === 'INVALID_PLACES_INPUT') throw error;
    const reason = fallbackReason(error);
    const runId = startOsmJob(request, reason);
    return { runId, status: 'RUNNING', source: osmJobs.get(runId).source, fallbackReason: reason };
  }
}

const MAX_LOOKUPS = 100;

/**
 * Look up many specific businesses in one run — e.g. the accounts of an
 * imported lead list ("Lucas TVS Ltd, Chennai"). One place per query; each
 * result's `searchTerm` is the query it answers.
 */
async function startPlacesLookup(queries) {
  const list = cleanList(queries).slice(0, MAX_LOOKUPS);
  if (list.length === 0) {
    throw createError('At least one business to look up is required.', 'INVALID_PLACES_INPUT', 400);
  }
  const input = {
    searchStringsArray: list,
    maxCrawledPlacesPerSearch: 1,
    language: 'en',
    skipClosedPlaces: false,
    scrapeContacts: apifyScrapeContacts,
  };
  return { ...(await startWithFallback(input, { kind: 'lookup', queries: list })), queries: list.length };
}

async function startPlacesSearch(params) {
  const input = buildPlacesInput(params);
  return startWithFallback(input, { kind: 'search', ...input });
}

/**
 * Poll a run. While running, returns only the status; once finished, returns
 * the normalized places (deduplicated by place id).
 */
async function getPlacesSearch(runId) {
  if (osmJobs.has(runId)) return osmJobResult(runId, osmJobs.get(runId));

  // A failed (or empty) Apify run continues on the fallback sources under the same run id.
  const pending = apifyRequests.get(runId);
  if (pending?.osmRunId) return { ...osmJobResult(pending.osmRunId, osmJobs.get(pending.osmRunId)), runId };

  const run = await getActorRun(runId);
  const base = { runId: run.id, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt, source: 'google_maps' };

  if (FINISHED_FAILED.includes(run.status)) {
    if (pending) {
      pending.osmRunId = startOsmJob(pending.request, `Google Maps run ${run.status.toLowerCase()}`);
      return { ...osmJobResult(pending.osmRunId, osmJobs.get(pending.osmRunId)), runId };
    }
    throw createError(`Google Maps scrape finished with status ${run.status}.`, 'SCRAPER_FAILED', 502);
  }
  if (run.status !== FINISHED_OK) {
    return { ...base, done: false, places: [] };
  }

  const seen = new Set();
  const places = (await getDatasetItems(run.defaultDatasetId))
    .map(normalizePlace)
    .filter((place) => place && !seen.has(place.id) && seen.add(place.id));

  // Nothing on Google Maps: try the fallback sources before giving up.
  if (places.length === 0 && pending && pending.request.kind === 'search') {
    pending.osmRunId = startOsmJob(pending.request, 'Google Maps found no businesses');
    return { ...osmJobResult(pending.osmRunId, osmJobs.get(pending.osmRunId)), runId };
  }

  return { ...base, done: true, places };
}

module.exports = { buildPlacesInput, normalizePlace, startPlacesSearch, startPlacesLookup, getPlacesSearch };
