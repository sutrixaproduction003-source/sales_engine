/**
 * "Find the person": business name + location → the business (Google Maps)
 * and the people who work there.
 *
 * People come from public Google results for LinkedIn profiles
 * (site:linkedin.com/in "<business>" …) — no LinkedIn login or scraping of
 * LinkedIn itself. When Apollo is configured, its people search for the
 * business's domain is merged in (verified titles; emails via enrichment).
 *
 * Runs are asynchronous (two Apify runs in parallel): start a job, then poll.
 */

const { startActorRun, getActorRun, getDatasetItems } = require('./apifyScrapers');
const { normalizePlace } = require('./placesService');
const leadService = require('./leadService');
const providerFactory = require('./providerFactory');
const logger = require('../utils/logger');
const { createError } = require('../utils/errors');

const PLACES_ACTOR = 'compass~crawler-google-places';
const SEARCH_ACTOR = 'apify~google-search-scraper';
const MAX_ROLES = 8;

const FAILED = ['FAILED', 'ABORTED', 'TIMED-OUT', 'TIMED_OUT'];
const RUNNING = ['READY', 'RUNNING'];

/** Words that say nothing about which business a profile belongs to. */
const GENERIC_WORDS = new Set([
  'the', 'and', 'of', 'at', 'by', 'a', 'an', 'hotel', 'hotels', 'resort', 'resorts', 'spa', 'and',
  'restaurant', 'restaurants', 'cafe', 'hospital', 'hospitals', 'clinic', 'group', 'pvt', 'ltd', 'private',
  'limited', 'inc', 'llp', 'co', 'company', 'india', 'international', 'suites', 'inn', 'residency',
]);

const clean = (value) => String(value ?? '').trim();
const quote = (value) => `"${clean(value).replace(/"/g, '')}"`;

function distinctiveTokens(business) {
  return clean(business)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !GENERIC_WORDS.has(word));
}

/** Roles searched individually (Google drops the business from grouped OR queries). */
const ROLE_QUERIES = 3;

/** Google queries for LinkedIn profiles of people at the business. */
function buildQueries(business, location, roles) {
  const city = clean(location).split(',')[0];
  return [
    `site:linkedin.com/in ${quote(business)} ${city}`.trim(),
    ...roles.slice(0, ROLE_QUERIES).map((role) => `site:linkedin.com/in ${quote(business)} ${quote(role)}`),
  ];
}

function validate({ business, location, roles }) {
  const name = clean(business);
  if (!name) throw createError('Business name is required.', 'INVALID_PEOPLE_INPUT', 400);
  const roleList = [...new Set((Array.isArray(roles) ? roles : []).map(clean).filter(Boolean))].slice(0, MAX_ROLES);
  return { business: name, location: clean(location), roles: roleList };
}

async function startPeopleSearch(params) {
  const { business, location, roles } = validate(params);

  const [placeRun, searchRun] = await Promise.all([
    startActorRun(PLACES_ACTOR, {
      searchStringsArray: [business],
      ...(location ? { locationQuery: location } : {}),
      maxCrawledPlacesPerSearch: 3,
      language: 'en',
      scrapeContacts: true,
    }),
    startActorRun(SEARCH_ACTOR, {
      queries: buildQueries(business, location, roles).join('\n'),
      resultsPerPage: 10,
      maxPagesPerQuery: 1,
      languageCode: 'en',
      mobileResults: false,
      saveHtml: false,
      saveHtmlToKeyValueStore: false,
    }),
  ]);

  return { jobId: `${placeRun.id}.${searchRun.id}`, status: 'RUNNING' };
}

const stripEllipsis = (value) => clean(value).replace(/\s*(\.\.\.|…)$/, '').trim();

/** ". Project Manager" / "Currently, I am an IT Intern" → "Project Manager" / "IT Intern". */
const tidyTitle = (value) =>
  stripEllipsis(value)
    .replace(/^[\s.,·:;|–-]+/, '')
    .replace(/^currently,?\s+(?:i\s+am\s+(?:an?\s+)?|working\s+as\s+(?:an?\s+)?)?/i, '')
    .trim();

const ABBREVIATION = /\b(st|dr|mr|mrs|ms|pvt|ltd|co|inc|no|sr|jr)$/i;

/**
 * Keep the first sentence: "Apollo Hospitals. Apollo … Hyderabad.Read more"
 * → "Apollo Hospitals", without cutting at abbreviations ("St. John's").
 */
function tidyCompany(value) {
  const text = stripEllipsis(value).replace(/\s*Read more$/i, '');
  const boundary = /\.\s*(?=[A-Z])/g;
  let match;
  while ((match = boundary.exec(text))) {
    const before = text.slice(0, match.index);
    if (!ABBREVIATION.test(before)) return before.replace(/[\s,]+$/, '').trim();
  }
  return text.replace(/[\s.,]+$/, '').trim();
}

/** "SHEETAL SINGH" / "ganesh Chandra" → "Sheetal Singh" / "Ganesh Chandra". */
function tidyName(name) {
  const words = name.split(/\s+/);
  const wellFormed = words.every((w) => /^[A-Z][a-z'’.-]*$/.test(w) || /^[A-Z]\.?$/.test(w));
  if (wellFormed) return name;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Parse a Google result for a LinkedIn profile, e.g.
 *   "Priya Sharma - General Manager - Taj Exotica Resort & Spa | LinkedIn"
 *   "Priya Sharma – Director of Sales at Taj Hotels – LinkedIn"
 */
function parseProfile(result) {
  const url = clean(result?.url);
  if (!/linkedin\.com\/in\//i.test(url)) return null;

  const title = clean(result.title).replace(/\s*[|\-–—]\s*LinkedIn.*$/i, '');
  const parts = title.split(/\s+[-–—|]\s+/).map(clean).filter(Boolean);
  const name = parts[0];
  if (!name || name.split(/\s+/).length > 5 || /linkedin/i.test(name)) return null;

  // Snippets usually read "Sales Manager at Taj Exotica · …" — the most
  // reliable source for the current role. Some start with "Name · ".
  const description = clean(result.description);
  const rest = description.startsWith(name) ? description.slice(name.length).replace(/^\s*·\s*/, '') : description;
  const fromSnippet = rest.match(/^([^·]{2,80}?)\s+at\s+([^·]+?)\s*(?:·|$)/i);

  let jobTitle = parts[1] || '';
  let company = parts[2] || '';
  const atMatch = jobTitle.match(/^(.*?)\s+at\s+(.+)$/i);
  if (atMatch) {
    jobTitle = atMatch[1];
    company = company || atMatch[2];
  }
  if (fromSnippet) {
    jobTitle = fromSnippet[1];
    company = fromSnippet[2];
  }

  return {
    id: `li-${url.replace(/^https?:\/\/[^/]+\/in\//i, '').replace(/[/?#].*$/, '')}`,
    name: tidyName(name),
    jobTitle: tidyTitle(jobTitle),
    company: tidyCompany(company),
    linkedinUrl: url.split('?')[0],
    snippet: description,
    email: '',
    source: 'linkedin_search',
  };
}

/** Rank people: at the business first, then by how senior the role is. */
function rankPeople(people, business, roles) {
  const tokens = distinctiveTokens(business);
  const roleList = roles.map((r) => r.toLowerCase());

  // A "title" that contains the business name: "Director Of Rooms Taj Exotica …"
  // → title "Director Of Rooms"; "Taj Exotica Resort & Spa, Goa" → no title.
  const splitBusiness = (person) => {
    const lower = person.jobTitle.toLowerCase();
    const hits = tokens.map((t) => lower.search(new RegExp(`\\b${t}\\b`))).filter((i) => i >= 0);
    if (!hits.length) return person;
    const index = Math.min(...hits);
    return {
      ...person,
      jobTitle: person.jobTitle.slice(0, index).replace(/[\s,|–-]+$/, '').trim(),
      company: person.company || person.jobTitle.slice(index).trim(),
    };
  };

  return people
    .map(splitBusiness)
    .map((person) => {
      const haystack = `${person.jobTitle} ${person.company} ${person.snippet || ''}`.toLowerCase();
      const title = person.jobTitle.toLowerCase();
      const roleIndex = roleList.findIndex((role) => title.includes(role));
      return {
        ...person,
        worksThere: tokens.length ? tokens.some((t) => haystack.includes(t)) : true,
        possiblyFormer: /\b(former|ex[- ]|previously|past)\b/i.test(`${person.jobTitle} ${person.snippet || ''}`),
        matchedRole: roleIndex >= 0 ? roles[roleIndex] : null,
        roleRank: roleIndex >= 0 ? roleIndex : roleList.length,
      };
    })
    .sort(
      (a, b) =>
        Number(b.worksThere) - Number(a.worksThere) ||
        Number(a.possiblyFormer) - Number(b.possiblyFormer) ||
        a.roleRank - b.roleRank
    )
    .map(({ roleRank, ...person }) => person);
}

function domainOf(website) {
  try {
    return new URL(/^https?:/.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Apollo people at the business's domain, when Apollo is configured. */
async function apolloPeople(business, roles) {
  const apollo = providerFactory.getProvider('apollo');
  const domain = business?.companyWebsite ? domainOf(business.companyWebsite) : '';
  if (!apollo.isConfigured() || !domain) return [];

  try {
    const result = await leadService.searchLeads('apollo', { domain, job_title: roles.join(',') }, 1);
    return result.leads.map((lead) => ({
      id: `apollo-${lead.id}`,
      apolloId: lead.id,
      name: lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' '),
      jobTitle: lead.jobTitle || '',
      company: lead.companyName || business.companyName,
      linkedinUrl: lead.linkedinUrl || '',
      snippet: '',
      email: lead.email || '',
      hasEmail: Boolean(lead.has_email),
      source: 'apollo',
    }));
  } catch (error) {
    logger.warn('Apollo people search failed', { message: error.message });
    return [];
  }
}

function mergePeople(lists) {
  const byKey = new Map();
  for (const person of lists.flat()) {
    const key = (person.linkedinUrl || person.name).toLowerCase().replace(/\/$/, '');
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...person, ...existing, email: existing.email || person.email } : person);
  }
  return [...byKey.values()];
}

/** Points of interest that are part of a business rather than the business. */
const SUB_PLACE = /\b(gate|entrance|exit|parking|pharmacy|atm|canteen|cafeteria|reception|block|wing|lobby|bus stop)\b/i;

/**
 * Google Maps can rank a sub-place (e.g. "… Main Gate") above the business
 * itself. Prefer names sharing the searched words, not sub-places, and then
 * the most-reviewed (the main listing).
 */
function pickBusiness(places, businessName) {
  if (places.length <= 1) return places[0] || null;
  const tokens = distinctiveTokens(businessName);
  const score = (place) => {
    const name = place.companyName.toLowerCase();
    const overlap = tokens.filter((t) => name.includes(t)).length;
    return overlap * 10 - (SUB_PLACE.test(name) && !SUB_PLACE.test(businessName) ? 25 : 0) + Math.log10((place.totalReviewsCount || 0) + 1);
  };
  return [...places].sort((a, b) => score(b) - score(a))[0];
}

async function runState(runId) {
  try {
    return await getActorRun(runId);
  } catch (error) {
    return { id: runId, status: 'FAILED', error: error.message };
  }
}

/**
 * Poll a job. While either run is active, returns progress only; once both
 * are finished, returns the business and the ranked people.
 */
async function getPeopleSearch(jobId, { business: businessName = '', roles = [] } = {}) {
  const [placeRunId, searchRunId] = String(jobId).split('.');
  if (!placeRunId || !searchRunId) throw createError('Invalid job id.', 'INVALID_JOB', 400);

  const [placeRun, searchRun] = await Promise.all([runState(placeRunId), runState(searchRunId)]);
  const progress = { business: placeRun.status, people: searchRun.status };
  if (RUNNING.includes(placeRun.status) || RUNNING.includes(searchRun.status)) {
    return { jobId, done: false, progress };
  }

  const warnings = [];
  let business = null;
  if (FAILED.includes(placeRun.status)) warnings.push(`Google Maps lookup ${placeRun.status.toLowerCase()}.`);
  else {
    const places = (await getDatasetItems(placeRun.defaultDatasetId)).map(normalizePlace).filter(Boolean);
    business = pickBusiness(places, businessName);
  }

  let people = [];
  if (FAILED.includes(searchRun.status)) warnings.push(`LinkedIn profile search ${searchRun.status.toLowerCase()}.`);
  else {
    const pages = await getDatasetItems(searchRun.defaultDatasetId);
    people = pages.flatMap((page) => (page.organicResults || []).map(parseProfile)).filter(Boolean);
  }

  const name = businessName || business?.companyName || '';
  const apollo = await apolloPeople(business, roles);
  // Profiles that never mention the business are search noise; Apollo results
  // are matched by domain and always kept.
  people = rankPeople(mergePeople([apollo, people]), name, roles).filter((p) => p.worksThere || p.source === "apollo");

  return {
    jobId,
    done: true,
    progress,
    business,
    people,
    apolloConfigured: providerFactory.getProvider('apollo').isConfigured(),
    warnings,
  };
}

module.exports = { buildQueries, parseProfile, rankPeople, pickBusiness, startPeopleSearch, getPeopleSearch };
