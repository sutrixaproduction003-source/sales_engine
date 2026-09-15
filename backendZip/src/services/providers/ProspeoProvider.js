const axios = require('axios');
const { prospeoApiKey } = require('../../config/env');
const BaseProvider = require('./BaseProvider');

/**
 * Safely parse a response body that may be a string (from axios transformResponse)
 * or already an object. Never throws — returns the raw value if parsing fails.
 */
function safeParse(data) {
  if (data === null || data === undefined) return null;
  if (typeof data === 'object') return data;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return { raw: trimmed };
    }
  }
  return data;
}

/**
 * Check a Prospeo API response for error indicators.
 * Prospeo returns { req_status: false, error_toast: "..." } on failure.
 * Throws a structured error when the response indicates failure.
 */
function assertProspeoResponse(data, statusCode) {
  if (!data) {
    const err = new Error('Prospeo API returned an empty response.');
    err.code = 'PROSPEO_EMPTY_RESPONSE';
    err.statusCode = 502;
    throw err;
  }

  // Support both the current REST envelope and the legacy response shape.
  if (data.error === true || data.req_status === false) {
    const err = new Error(
      data.filter_error || data.error_code || data.error_toast || 'Prospeo API request failed.'
    );
    err.code = 'PROSPEO_API_ERROR';
    err.statusCode = statusCode >= 500 ? 502 : 400;
    err.details = data;
    throw err;
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
    googleMapsLink: hotelName
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${hotelName} ${locationText}`.trim())}`
      : undefined,
    googleBusinessLink: hotelName
      ? `https://www.google.com/search?q=${encodeURIComponent(`${hotelName} ${locationText}`.trim())}`
      : undefined,
    industry: company.industry,
    source: 'prospeo',
  };
}

class ProspeoProvider extends BaseProvider {
  constructor() {
    super('prospeo');
    this.client = axios.create({
      baseURL: 'https://api.prospeo.io',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
      // Accept all status codes — Prospeo returns 404 with a JSON body
      // for invalid keys rather than a standard error.
      validateStatus: () => true,
      // Safely parse JSON — never throw on malformed JSON bodies.
      transformResponse: [(data) => {
        if (typeof data !== 'string') return data;
        try {
          return JSON.parse(data);
        } catch {
          return data; // return raw string; assertProspeoResponse will handle it
        }
      }],
    });
  }

  _ensureApiKey() {
    if (!prospeoApiKey) {
      const error = new Error('Prospeo API key is missing.');
      error.code = 'MISSING_API_KEY';
      error.statusCode = 401;
      throw error;
    }
  }

  async searchPeople(filters = {}, page = 1) {
    this._ensureApiKey();

    const apiFilters = {};
    if (filters.location?.trim()) {
      const suggestionResponse = await this.client.post('/search-suggestions', {
        location_search: filters.location.trim(),
      }, { headers: { 'X-KEY': prospeoApiKey } });
      const location = firstSuggestion(suggestionResponse.data, 'location_suggestions');
      if (location) apiFilters.person_location_search = { include: [location] };
    }
    if (filters.industry?.trim()) {
      const suggestionResponse = await this.client.post('/search-suggestions', {
        industry_search: filters.industry.trim(),
      }, { headers: { 'X-KEY': prospeoApiKey } });
      const industry = firstSuggestion(suggestionResponse.data, 'industry_suggestions');
      if (industry) apiFilters.company_industry = { include: [industry] };
    }
    if (filters.job_title?.trim()) {
      const suggestionResponse = await this.client.post('/search-suggestions', {
        job_title_search: filters.job_title.trim(),
      }, { headers: { 'X-KEY': prospeoApiKey } });
      const jobTitle = firstSuggestion(suggestionResponse.data, 'job_title_suggestions');
      if (jobTitle) {
        apiFilters.person_job_title = { include: [jobTitle], match_mode: 'CONTAINS' };
      }
    }

    const response = await this.client.post('/search-person', {
      page,
      filters: apiFilters,
    }, {
      headers: { 'X-KEY': prospeoApiKey },
    });

    const data = safeParse(response.data);
    const parsed = assertProspeoResponse(data, response.status);
    return {
      ...parsed,
      items: Array.isArray(parsed.results) ? parsed.results.map(flattenResult) : [],
    };
  }

  async searchCompanies(filters = {}, page = 1) {
    this._ensureApiKey();

    const response = await this.client.get('/v1/search/companies', {
      headers: { 'X-KEY': prospeoApiKey },
      params: {
        ...filters,
        page,
      },
    });

    const data = safeParse(response.data);
    return assertProspeoResponse(data, response.status);
  }

  async enrichPerson(payload = {}) {
    this._ensureApiKey();

    const response = await this.client.post('/v1/enrich/person', payload, {
      headers: { 'X-KEY': prospeoApiKey },
    });

    const data = safeParse(response.data);
    return assertProspeoResponse(data, response.status);
  }

  async enrichCompany(payload = {}) {
    this._ensureApiKey();

    const response = await this.client.post('/v1/enrich/company', payload, {
      headers: { 'X-KEY': prospeoApiKey },
    });

    const data = safeParse(response.data);
    return assertProspeoResponse(data, response.status);
  }

  async getAccountInformation() {
    this._ensureApiKey();

    const response = await this.client.get('/v1/account', {
      headers: { 'X-KEY': prospeoApiKey },
    });

    const data = safeParse(response.data);
    return assertProspeoResponse(data, response.status);
  }
}

module.exports = ProspeoProvider;
