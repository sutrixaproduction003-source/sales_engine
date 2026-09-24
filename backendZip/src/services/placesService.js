/**
 * Google Maps place scraping (Apify "Google Maps Scraper") for location-based
 * lead discovery: "hotels in Goa" → businesses with exact coordinates,
 * address, phone, website, rating and — when contact scraping is enabled —
 * emails and social profiles found on their websites.
 *
 * Runs are asynchronous: start a run, then poll it. Scrapes routinely take
 * longer than a serverless request is allowed to live.
 */

const { startActorRun, getActorRun, getDatasetItems } = require('./apifyScrapers');
const { createError } = require('../utils/errors');
const { apifyScrapeContacts } = require('../config/env');

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
  const run = await startActorRun(ACTOR, {
    searchStringsArray: list,
    maxCrawledPlacesPerSearch: 1,
    language: 'en',
    skipClosedPlaces: false,
    scrapeContacts: apifyScrapeContacts,
  });
  return { runId: run.id, status: run.status, queries: list.length };
}

async function startPlacesSearch(params) {
  const run = await startActorRun(ACTOR, buildPlacesInput(params));
  return { runId: run.id, status: run.status };
}

/**
 * Poll a run. While running, returns only the status; once finished, returns
 * the normalized places (deduplicated by place id).
 */
async function getPlacesSearch(runId) {
  const run = await getActorRun(runId);
  const base = { runId: run.id, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt };

  if (FINISHED_FAILED.includes(run.status)) {
    throw createError(`Google Maps scrape finished with status ${run.status}.`, 'SCRAPER_FAILED', 502);
  }
  if (run.status !== FINISHED_OK) {
    return { ...base, done: false, places: [] };
  }

  const seen = new Set();
  const places = (await getDatasetItems(run.defaultDatasetId))
    .map(normalizePlace)
    .filter((place) => place && !seen.has(place.id) && seen.add(place.id));

  return { ...base, done: true, places };
}

module.exports = { buildPlacesInput, normalizePlace, startPlacesSearch, startPlacesLookup, getPlacesSearch };
