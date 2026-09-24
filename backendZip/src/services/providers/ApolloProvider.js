/**
 * ApolloProvider — Apollo implementation of the Sales Engine provider
 * abstraction.
 *
 * Search finds prospects (Apollo never returns real contact data there);
 * enrichment is used later to retrieve the available contact data.
 */

const BaseProvider = require('./BaseProvider');
const { apolloApiKey } = require('../../config/env');
const { currentContext } = require('../../utils/requestContext');
const { createError } = require('../../utils/errors');

const SEARCH_PATH = '/mixed_people/api_search';
const ENRICH_PATH = '/people/match';

const DEFAULT_PER_PAGE = 10;
const MAX_PER_PAGE = 100;

/** Apollo industry facet values. */
const KNOWN_INDUSTRIES = new Set([
  'hospitality',
  'food & beverages',
  'restaurants',
  'travel arrangements',
  'leisure, travel & tourism',
  'real estate',
]);

/** User/project phrasing -> Apollo industry facet. */
const INDUSTRY_SYNONYMS = {
  hotels: 'hospitality',
  hotel: 'hospitality',
  resorts: 'hospitality',
  resort: 'hospitality',
  restaurants: 'restaurants',
  restaurant: 'restaurants',
  'property management': 'real estate',
};

function toCoordinate(value) {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Convert a filter value (array or comma-separated string) into a clean list. */
function asList(value) {
  if (value === undefined || value === null || value === '') return [];
  const parts = Array.isArray(value) ? value.map(String) : String(value).split(',');
  return parts.map((x) => x.trim()).filter(Boolean);
}

/** Return the first non-empty list from the supplied filter keys. */
function pickList(filters, keys) {
  for (const key of keys) {
    const list = asList(filters[key]);
    if (list.length) return list;
  }
  return [];
}

/**
 * Map a user-supplied industry to Apollo facet values. Unknown industries are
 * title-cased and also sent word by word to widen the match.
 */
function toApolloIndustries(name) {
  const lower = String(name).trim().toLowerCase();
  if (!lower) return [];
  if (INDUSTRY_SYNONYMS[lower]) return [INDUSTRY_SYNONYMS[lower]];
  if (KNOWN_INDUSTRIES.has(lower)) return [lower];

  const words = lower.split(/[^a-z0-9&]+/).filter(Boolean);
  if (!words.length) return [name];

  const titled = words.map((word) => (word === '&' ? word : word.charAt(0).toUpperCase() + word.slice(1)));
  return [titled.join(' '), ...titled];
}

/** Extract a bare domain: "https://www.example.com/about" -> "example.com". */
function extractDomain(value) {
  const input = String(value || '').trim();
  if (!input) return '';

  try {
    return new URL(input.startsWith('http') ? input : `https://${input}`).hostname.replace(/^www\./, '');
  } catch {
    return input.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

/** Build a readable error message from an Apollo error body. */
function apolloErrorMessage(data, fallback) {
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors.map((item) => item.message || String(item)).join('; ');
  }
  return data?.error || data?.message || fallback;
}

/** Fields shared by search results and enrichment matches. */
function basePersonFields(person) {
  const org = person.organization || {};
  const location = [person.city, person.state, person.country].filter(Boolean).join(', ');

  return {
    id: person.id ? String(person.id) : '',
    linkedinUrl: person.linkedin_url || '',
    companyName: org.name || org.organization_name || '',
    industry: org.industry || person.industry || '',
    location: location || person.location || '',
    state: person.state || '',
    country: person.country || '',
    latitude: toCoordinate(person.latitude ?? person.geo?.latitude ?? person.lat),
    longitude: toCoordinate(person.longitude ?? person.geo?.longitude ?? person.lng),
    source: 'apollo',
    rawData: person,
  };
}

/**
 * Transform one Apollo search result into the common lead structure.
 * Apollo Search does not expose real emails or phones — never invent them.
 */
function normalizeSearchPerson(person) {
  if (!person || typeof person !== 'object') return null;

  const org = person.organization || {};
  const lastName = person.last_name_obfuscated || person.last_name || person.lastName || '';

  return {
    ...basePersonFields(person),
    firstName: person.first_name || person.firstName || '',
    lastName,
    fullName: [person.first_name, person.last_name_obfuscated || person.last_name].filter(Boolean).join(' ').trim(),
    jobTitle: person.title || person.job_title || null,
    email: '',
    emailStatus: '',
    phone: '',
    companyWebsite: org.domain || org.url || '',
    has_email: Boolean(person.has_email),
    has_phone: Boolean(person.has_direct_phone || org.has_phone),
  };
}

/** Transform an Apollo /people/match person, falling back to the request input. */
function normalizeEnrichedPerson(person, input) {
  const org = person.organization || {};
  const base = basePersonFields(person);

  return {
    ...base,
    id: base.id || String(input.id || ''),
    firstName: person.first_name || input.firstName || '',
    lastName: person.last_name || input.lastName || '',
    fullName: person.name || [person.first_name, person.last_name].filter(Boolean).join(' ').trim(),
    jobTitle: person.title || '',
    email: person.email || '',
    emailStatus: person.email_status || '',
    phone: person.phone || person.phone_number || '',
    linkedinUrl: base.linkedinUrl || input.linkedinUrl || '',
    companyWebsite: org.primary_domain || org.domain || org.url || input.companyWebsite || '',
  };
}

/** Convert axios network errors into Sales Engine errors. */
function mapNetworkError(error) {
  switch (error?.code) {
    case 'ECONNABORTED':
    case 'ETIMEDOUT':
      return createError('Apollo request timed out.', 'APOLLO_TIMEOUT', 504, { provider: 'apollo' });
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
      return createError('Unable to reach Apollo API.', 'APOLLO_NETWORK_ERROR', 502, { provider: 'apollo' });
    case undefined:
    case null:
    case '':
      return createError('Apollo request failed for an unknown reason.', 'APOLLO_REQUEST_ERROR', 500, {
        provider: 'apollo',
      });
    default:
      return Object.assign(error, { provider: 'apollo' });
  }
}

class ApolloProvider extends BaseProvider {
  constructor() {
    super('apollo', {
      baseURL: 'https://api.apollo.io/api/v1',
      headers: { Accept: 'application/json' },
    });
  }

  /** The key saved in the app's Settings (forwarded per request), else backendZip/.env. */
  get apiKey() {
    return currentContext().apolloApiKey || apolloApiKey;
  }

  set apiKey(_value) {
    // Set by BaseProvider's constructor; the key is always resolved per request.
  }

  async post(path, body, config = {}) {
    this.ensureConfigured();
    try {
      return await this.client.post(path, body, { ...config, headers: { ...config.headers, 'x-api-key': this.apiKey } });
    } catch (error) {
      throw mapNetworkError(error);
    }
  }

  /** Build the Apollo People Search request body. */
  buildSearchParams({ page, perPage, filters = {} }) {
    const n = Number(perPage);
    const params = {
      page: Math.max(1, Number(page) || 1),
      per_page: Number.isFinite(n) && n >= 1 ? Math.min(MAX_PER_PAGE, n) : DEFAULT_PER_PAGE,
    };

    const query = filters.query || filters.q || filters.keywords;
    if (query) params.q = String(query);

    const listParams = {
      person_titles: ['jobTitles', 'jobTitle', 'job_title'],
      person_locations: ['locations', 'location'],
      organization_names: ['companyNames', 'companyName', 'company_name'],
      organization_domains: ['domains', 'domain', 'companyWebsite', 'company_website'],
    };
    for (const [param, keys] of Object.entries(listParams)) {
      const list = pickList(filters, keys);
      if (list.length) params[param] = list;
    }

    const industries = [...new Set(pickList(filters, ['industries', 'industry']).flatMap(toApolloIndustries))];
    if (industries.length) params.organization_industries = industries;

    return params;
  }

  async searchPeople(filters = {}, page = 1) {
    const requestBody = this.buildSearchParams({ page, perPage: DEFAULT_PER_PAGE, filters });
    const { status, data = {} } = await this.post(SEARCH_PATH, requestBody);

    if (status < 200 || status >= 300) {
      const code = data?.errors?.[0]?.extensions?.code || data?.errors?.[0]?.code || 'APOLLO_API_ERROR';
      throw createError(apolloErrorMessage(data, `Apollo API request failed (HTTP ${status})`), code, status, {
        provider: 'apollo',
        response: data,
      });
    }

    const people = Array.isArray(data?.people) ? data.people : [];
    return {
      data: {
        items: people.map(normalizeSearchPerson).filter(Boolean),
        total: Number(data?.total_entries) || 0,
        page: requestBody.page,
        perPage: requestBody.per_page,
      },
    };
  }

  /**
   * Enrich one Apollo person. The preferred identifier is the Apollo person
   * ID from People Search; email, LinkedIn URL, or name + domain also work.
   */
  async enrichPerson(input = {}) {
    const { id, firstName, lastName, companyWebsite, email, linkedinUrl } = input;
    const params = { reveal_personal_emails: false, reveal_phone_number: false };

    if (id) {
      params.id = String(id);
    } else if (email) {
      params.email = String(email).trim();
    } else if (linkedinUrl) {
      params.linkedin_url = String(linkedinUrl).trim();
    } else {
      if (firstName) params.first_name = String(firstName).trim();
      if (lastName) params.last_name = String(lastName).trim();
      if (companyWebsite) params.domain = extractDomain(companyWebsite);
    }

    const hasIdentifier =
      params.id || params.email || params.linkedin_url || (params.first_name && params.last_name && params.domain);

    if (!hasIdentifier) {
      throw createError(
        'Apollo enrichment requires an Apollo person ID, email, LinkedIn URL, or name plus company domain.',
        'INVALID_ENRICHMENT_INPUT',
        400,
        { provider: 'apollo' }
      );
    }

    const { status, data = {} } = await this.post(ENRICH_PATH, null, {
      params,
      headers: { 'Cache-Control': 'no-cache' },
    });

    if (status < 200 || status >= 300) {
      throw createError(
        apolloErrorMessage(data, `Apollo enrichment failed (HTTP ${status})`),
        'APOLLO_ENRICHMENT_ERROR',
        status,
        { provider: 'apollo', response: data }
      );
    }

    const person = data?.person;
    if (!person) {
      return { data: { lead: null, matched: false } };
    }

    return { data: { lead: normalizeEnrichedPerson(person, input), matched: true } };
  }
}

module.exports = ApolloProvider;
