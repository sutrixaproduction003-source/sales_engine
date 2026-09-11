const axios = require('axios');
const { hunterApiKey } = require('../../config/env');
const BaseProvider = require('./BaseProvider');

/**
 * Shared safe JSON parse — never throws, returns the raw value on failure.
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
 * Check a Hunter API response for error indicators.
 * Hunter returns { errors: ["..."] } on failure.
 * Throws a structured error when the response indicates failure.
 */
function assertHunterResponse(data, statusCode) {
  if (!data) {
    const err = new Error('Hunter API returned an empty response.');
    err.code = 'HUNTER_EMPTY_RESPONSE';
    err.statusCode = 502;
    throw err;
  }

  // Hunter's standard error envelope
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const err = new Error(typeof data.errors[0] === 'string' ? data.errors[0] : 'Hunter API request failed.');
    err.code = 'HUNTER_API_ERROR';
    err.statusCode = statusCode >= 500 ? 502 : 400;
    err.details = data;
    throw err;
  }

  return data;
}

class HunterProvider extends BaseProvider {
  constructor() {
    super('hunter');
    this.client = axios.create({
      baseURL: 'https://api.hunter.io/v2',
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
      },
      // Accept all status codes — Hunter may return error bodies with non-2xx.
      validateStatus: () => true,
      // Safely parse JSON — never throw on malformed JSON bodies.
      transformResponse: [(data) => {
        if (typeof data !== 'string') return data;
        try {
          return JSON.parse(data);
        } catch {
          return data;
        }
      }],
    });
  }

  _ensureApiKey() {
    if (!hunterApiKey) {
      const error = new Error('Hunter API key is missing.');
      error.code = 'MISSING_API_KEY';
      error.statusCode = 401;
      throw error;
    }
  }

  async searchPeople(filters = {}, page = 1) {
    const error = new Error('This search capability is not supported by Hunter.');
    error.code = 'PROVIDER_CAPABILITY_UNSUPPORTED';
    error.statusCode = 400;
    throw error;
  }

  async searchCompanies(filters = {}, page = 1) {
    this._ensureApiKey();

    const response = await this.client.get('/discover', {
      params: {
        api_key: hunterApiKey,
        ...filters,
        limit: filters.limit || 10,
        offset: (page - 1) * (filters.limit || 10),
      },
    });

    const data = safeParse(response.data);
    return assertHunterResponse(data, response.status);
  }

  async enrichPerson(payload = {}) {
    this._ensureApiKey();

    const response = await this.client.get('/people/find', {
      params: {
        api_key: hunterApiKey,
        email: payload.email || payload.companyWebsite,
      },
    });

    const data = safeParse(response.data);
    return assertHunterResponse(data, response.status);
  }

  async enrichCompany(payload = {}) {
    this._ensureApiKey();

    const response = await this.client.get('/companies/find', {
      params: {
        api_key: hunterApiKey,
        domain: payload.domain || payload.companyWebsite,
      },
    });

    const data = safeParse(response.data);
    return assertHunterResponse(data, response.status);
  }

  async getAccountInformation() {
    this._ensureApiKey();

    const response = await this.client.get('/account', {
      params: { api_key: hunterApiKey },
    });

    const data = safeParse(response.data);
    return assertHunterResponse(data, response.status);
  }

  async findEmail(payload = {}) {
    this._ensureApiKey();

    const response = await this.client.get('/email-finder', {
      params: {
        api_key: hunterApiKey,
        domain: payload.domain,
        first_name: payload.firstName,
        last_name: payload.lastName,
      },
    });

    const data = safeParse(response.data);
    return assertHunterResponse(data, response.status);
  }

  async verifyEmail(payload = {}) {
    this._ensureApiKey();

    const response = await this.client.get('/email-verifier', {
      params: {
        api_key: hunterApiKey,
        email: payload.email,
      },
    });

    const data = safeParse(response.data);
    return assertHunterResponse(data, response.status);
  }
}

module.exports = HunterProvider;
