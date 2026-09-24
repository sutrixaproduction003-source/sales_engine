const { hunterApiKey } = require('../../config/env');
const { createError } = require('../../utils/errors');
const BaseProvider = require('./BaseProvider');

/**
 * Hunter returns `{ errors: [...] }` on failure; turn that into a thrown error.
 */
function assertHunterResponse(data, statusCode) {
  if (!data) {
    throw createError('Hunter API returned an empty response.', 'HUNTER_EMPTY_RESPONSE', 502);
  }

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const message = typeof data.errors[0] === 'string' ? data.errors[0] : 'Hunter API request failed.';
    throw createError(message, 'HUNTER_API_ERROR', statusCode >= 500 ? 502 : 400, { details: data });
  }

  return data;
}

class HunterProvider extends BaseProvider {
  constructor() {
    super('hunter', { apiKey: hunterApiKey, baseURL: 'https://api.hunter.io/v2', timeout: 20000 });
  }

  async request(path, params = {}) {
    this.ensureConfigured();
    const response = await this.client.get(path, { params: { ...params, api_key: this.apiKey } });
    return assertHunterResponse(response.data, response.status);
  }

  async searchCompanies(filters = {}, page = 1) {
    const limit = filters.limit || 10;
    return this.request('/discover', { ...filters, limit, offset: (page - 1) * limit });
  }

  async enrichPerson(payload = {}) {
    if (!payload.email) {
      throw createError('Hunter person enrichment requires an email address.', 'INVALID_ENRICHMENT_INPUT', 400, {
        provider: this.name,
      });
    }
    return this.request('/people/find', { email: payload.email });
  }

  async enrichCompany(payload = {}) {
    return this.request('/companies/find', { domain: payload.domain || payload.companyWebsite });
  }

  async getAccountInformation() {
    return this.request('/account');
  }

  async findEmail(payload = {}) {
    return this.request('/email-finder', {
      domain: payload.domain,
      first_name: payload.firstName,
      last_name: payload.lastName,
    });
  }

  async verifyEmail(payload = {}) {
    return this.request('/email-verifier', { email: payload.email });
  }
}

module.exports = HunterProvider;
