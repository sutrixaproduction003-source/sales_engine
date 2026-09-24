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
const PHONE_RESULT_PATH = '/webhook_result';

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

/**
 * Apollo's phone request_id is a 64-bit integer — larger than a JS number can
 * hold exactly — so read it from the raw response text.
 */
function readRequestId(raw) {
  const match = /"request_id"\s*:\s*"?(\d+)/.exec(String(raw || ''));
  return match ? match[1] : null;
}

const PHONE_TYPE_RANK = { mobile: 0, work_direct: 1, direct: 1, other: 2, work_hq: 3, home: 4 };

/** Numbers from a phone result, best first: mobile, then direct lines; valid before unverified. */
function rankPhones(phoneNumbers) {
  return (Array.isArray(phoneNumbers) ? phoneNumbers : [])
    .map((p) => ({
      number: String(p.sanitized_number || p.raw_number || '').trim(),
      type: String(p.type_cd || p.type || 'other').toLowerCase(),
      valid: !p.status_cd || p.status_cd === 'valid_number',
      dnc: Boolean(p.dnc_status && p.dnc_status !== 'not_on_dnc'),
    }))
    .filter((p) => p.number)
    .sort((a, b) => (PHONE_TYPE_RANK[a.type] ?? 2) - (PHONE_TYPE_RANK[b.type] ?? 2) || Number(b.valid) - Number(a.valid));
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

  async get(path, config = {}) {
    this.ensureConfigured();
    try {
      return await this.client.get(path, { ...config, headers: { ...config.headers, 'x-api-key': this.apiKey } });
    } catch (error) {
      throw mapNetworkError(error);
    }
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

    const query = filters.query || filters.q || filters.keywords || filters.q_keywords;
    if (query) params.q_keywords = String(query);

    const listParams = {
      person_titles: ['jobTitles', 'jobTitle', 'job_title'],
      person_locations: ['locations', 'location'],
      organization_names: ['companyNames', 'companyName', 'company_name'],
      person_seniorities: ['seniorities', 'seniority'],
    };
    for (const [param, keys] of Object.entries(listParams)) {
      const list = pickList(filters, keys);
      if (list.length) params[param] = list;
    }

    // People at specific companies, by website domain ("https://www.x.com/a" → "x.com").
    const domains = [...new Set(pickList(filters, ['domains', 'domain', 'companyWebsite', 'company_website']).map(extractDomain).filter(Boolean))];
    if (domains.length) params.q_organization_domains_list = domains;

    if (params.person_titles) params.include_similar_titles = true;

    const industries = [...new Set(pickList(filters, ['industries', 'industry']).flatMap(toApolloIndustries))];
    if (industries.length) params.organization_industries = industries;

    return params;
  }

  /**
   * Companies by HQ location, keyword tags and/or name (1 credit per page).
   * → raw Apollo organization objects.
   */
  async searchOrganizations({ locations = [], keywordTags = [], name = '', perPage = 25 } = {}, page = 1) {
    const body = { page: Math.max(1, Number(page) || 1), per_page: Math.min(MAX_PER_PAGE, Math.max(1, Number(perPage) || 25)) };
    if (locations.length) body.organization_locations = locations;
    if (keywordTags.length) body.q_organization_keyword_tags = keywordTags;
    if (name) body.q_organization_name = name;

    const { status, data = {} } = await this.post('/mixed_companies/search', body);
    if (status < 200 || status >= 300) {
      throw createError(apolloErrorMessage(data, `Apollo company search failed (HTTP ${status})`), 'APOLLO_API_ERROR', status, {
        provider: 'apollo',
      });
    }
    return [...(Array.isArray(data.organizations) ? data.organizations : []), ...(Array.isArray(data.accounts) ? data.accounts : [])];
  }

  async searchPeople(filters = {}, page = 1) {
    const requestBody = this.buildSearchParams({ page, perPage: filters.perPage || DEFAULT_PER_PAGE, filters });
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
    const { id, firstName, lastName, companyWebsite, organizationName, email, linkedinUrl, revealPhone } = input;
    // Mobile numbers are delivered later; poll_only lets us collect them with
    // getPhoneResult instead of exposing a public webhook.
    const params = revealPhone
      ? { reveal_personal_emails: false, reveal_phone_number: true, poll_only: true }
      : { reveal_personal_emails: false, reveal_phone_number: false };

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
      if (organizationName) params.organization_name = String(organizationName).trim();
    }

    const hasIdentifier =
      params.id ||
      params.email ||
      params.linkedin_url ||
      (params.first_name && params.last_name && (params.domain || params.organization_name));

    if (!hasIdentifier) {
      throw createError(
        'Apollo enrichment requires an Apollo person ID, email, LinkedIn URL, or name plus company (domain or name).',
        'INVALID_ENRICHMENT_INPUT',
        400,
        { provider: 'apollo' }
      );
    }

    const response = await this.post(ENRICH_PATH, null, {
      params,
      headers: { 'Cache-Control': 'no-cache' },
      transformResponse: [(raw) => raw],
    });
    const { status } = response;
    const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? null);
    let data = {};
    try {
      data = JSON.parse(raw) || {};
    } catch {
      data = { raw };
    }

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

    const lead = normalizeEnrichedPerson(person, input);
    // Numbers Apollo already holds come back immediately; the rest via polling.
    const known = rankPhones(person.phone_numbers);
    if (!lead.phone && known.length) lead.phone = known[0].number;
    const phoneRequestId = revealPhone ? readRequestId(raw) : null;
    return { data: { lead, matched: true, phoneRequestId } };
  }

  /**
   * Collect the phone numbers requested with enrichPerson({ revealPhone }).
   * → { status: 'pending' | 'found' | 'none' | 'failed', phone, phones }
   */
  async getPhoneResult(requestId) {
    if (!/^\d+$/.test(String(requestId || ''))) {
      throw createError('Invalid phone request id.', 'INVALID_PHONE_REQUEST', 400, { provider: 'apollo' });
    }
    const { status, data = {} } = await this.get(`${PHONE_RESULT_PATH}/${requestId}`);

    if (status === 404 && data?.error_code === 'result_pending') {
      return { status: 'pending', retryAfterSeconds: Number(data.retry_after_seconds) || 10 };
    }
    if (status === 401 || status === 403) {
      throw createError(apolloErrorMessage(data, 'Apollo rejected the API key.'), 'APOLLO_AUTH_ERROR', status, { provider: 'apollo' });
    }
    if (status < 200 || status >= 300) {
      // Expired, unknown or invalid ids never resolve.
      return { status: 'failed', reason: data?.error_code || apolloErrorMessage(data, `HTTP ${status}`) };
    }
    if (data.webhook_status === 'in_progress') return { status: 'pending', retryAfterSeconds: 10 };
    if (data.webhook_status === 'failed') return { status: 'failed', reason: data.failure_reason || 'Apollo could not look up this number.' };

    const people = Array.isArray(data.webhook_result?.people) ? data.webhook_result.people : [];
    const phones = rankPhones(people.flatMap((p) => p.phone_numbers || []));
    return phones.length ? { status: 'found', phone: phones[0].number, phones } : { status: 'none', phones: [] };
  }
}

module.exports = ApolloProvider;
