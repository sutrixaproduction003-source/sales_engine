const { prospeoApiKey } = require('../../config/env');
const { createError } = require('../../utils/errors');
const BaseProvider = require('./BaseProvider');

/**
 * Prospeo signals failure with `{ error: true }` (REST) or
 * `{ req_status: false }` (legacy); turn either into a thrown error.
 */
function assertProspeoResponse(data, statusCode) {
  if (!data) {
    throw createError('Prospeo API returned an empty response.', 'PROSPEO_EMPTY_RESPONSE', 502);
  }

  if (data.error === true || data.req_status === false) {
    const message = data.filter_error || data.error_code || data.error_toast || 'Prospeo API request failed.';
    throw createError(message, 'PROSPEO_API_ERROR', statusCode >= 500 ? 502 : 400, { details: data });
  }

  return data;
}

function firstSuggestion(data, key) {
  const values = data?.[key];
  if (!Array.isArray(values) || values.length === 0) return null;
  const first = values[0];
  return typeof first === 'string' ? first : first?.name ?? null;
}

function flattenResult(result) {
  const person = result?.person || {};
  const company = result?.company || {};
  const location = person.location || {};
  const hotelName = company.name;
  const locationText = [location.city, location.state, location.country].filter(Boolean).join(', ');
  const placeQuery = hotelName ? encodeURIComponent(`${hotelName} ${locationText}`.trim()) : null;

  return {
    id: person.person_id,
    firstName: person.first_name,
    lastName: person.last_name,
    fullName: person.full_name,
    jobTitle: person.current_job_title,
    companyName: company.name,
    companyWebsite: company.website || company.domain,
    email: person.email?.email,
    phone: person.mobile?.mobile,
    linkedinUrl: person.linkedin_url,
    location: locationText,
    city: location.city,
    state: location.state || location.country,
    hotelName,
    googleMapsLink: placeQuery ? `https://www.google.com/maps/search/?api=1&query=${placeQuery}` : undefined,
    googleBusinessLink: placeQuery ? `https://www.google.com/search?q=${placeQuery}` : undefined,
    industry: company.industry,
    source: 'prospeo',
  };
}

/**
 * Free-text search filters that Prospeo needs resolved through
 * /search-suggestions before they can be used in /search-person.
 */
const SUGGESTED_FILTERS = [
  {
    filter: 'location',
    searchKey: 'location_search',
    resultKey: 'location_suggestions',
    apply: (value) => ({ person_location_search: { include: [value] } }),
  },
  {
    filter: 'industry',
    searchKey: 'industry_search',
    resultKey: 'industry_suggestions',
    apply: (value) => ({ company_industry: { include: [value] } }),
  },
  {
    filter: 'job_title',
    searchKey: 'job_title_search',
    resultKey: 'job_title_suggestions',
    apply: (value) => ({ person_job_title: { include: [value], match_mode: 'CONTAINS' } }),
  },
];

class ProspeoProvider extends BaseProvider {
  constructor() {
    super('prospeo', {
      apiKey: prospeoApiKey,
      baseURL: 'https://api.prospeo.io',
      headers: { 'X-KEY': prospeoApiKey },
    });
  }

  async request(method, path, { data, params } = {}) {
    this.ensureConfigured();
    const response = await this.client.request({ method, url: path, data, params });
    return assertProspeoResponse(response.data, response.status);
  }

  async suggest(searchKey, query, resultKey) {
    const response = await this.client.post('/search-suggestions', { [searchKey]: query });
    return firstSuggestion(response.data, resultKey);
  }

  async searchPeople(filters = {}, page = 1) {
    this.ensureConfigured();

    const apiFilters = {};
    for (const { filter, searchKey, resultKey, apply } of SUGGESTED_FILTERS) {
      const query = typeof filters[filter] === 'string' ? filters[filter].trim() : '';
      if (!query) continue;
      const suggestion = await this.suggest(searchKey, query, resultKey);
      if (suggestion) Object.assign(apiFilters, apply(suggestion));
    }

    const parsed = await this.request('post', '/search-person', { data: { page, filters: apiFilters } });
    return {
      ...parsed,
      items: Array.isArray(parsed.results) ? parsed.results.map(flattenResult) : [],
    };
  }

  async searchCompanies(filters = {}, page = 1) {
    return this.request('get', '/v1/search/companies', { params: { ...filters, page } });
  }

  async enrichPerson(payload = {}) {
    return this.request('post', '/v1/enrich/person', { data: payload });
  }

  async enrichCompany(payload = {}) {
    return this.request('post', '/v1/enrich/company', { data: payload });
  }

  async getAccountInformation() {
    return this.request('get', '/v1/account');
  }
}

module.exports = ProspeoProvider;
