const axios = require('axios');
const { createError } = require('../../utils/errors');

const CAPABILITIES = [
  'searchPeople',
  'searchCompanies',
  'enrichPerson',
  'enrichCompany',
  'getAccountInformation',
  'findEmail',
  'verifyEmail',
];

/**
 * Parse a response body that may be a JSON string or already an object.
 * Never throws: empty bodies become null, non-JSON text becomes `{ raw }`.
 */
function safeParse(data) {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'string') return data;

  const trimmed = data.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return { raw: trimmed };
  }
}

/**
 * Shared provider base: API-key handling, a tolerant axios client, and
 * default "unsupported" implementations for every capability.
 */
class BaseProvider {
  constructor(name, { apiKey = '', baseURL, timeout = 15000, headers = {} } = {}) {
    this.name = name;
    this.apiKey = apiKey;

    if (baseURL) {
      this.client = axios.create({
        baseURL,
        timeout,
        headers: { 'Content-Type': 'application/json', ...headers },
        // Providers return JSON error bodies with non-2xx codes; inspect them
        // ourselves instead of letting axios throw.
        validateStatus: () => true,
        transformResponse: [safeParse],
      });
    }
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  ensureConfigured() {
    if (!this.isConfigured()) {
      throw createError(
        `${this.name} provider is not configured (API key is missing).`,
        'PROVIDER_NOT_CONFIGURED',
        503,
        { provider: this.name }
      );
    }
  }

  /** Whether this provider overrides the default "unsupported" capability. */
  supports(capability) {
    return typeof this[capability] === 'function' && this[capability] !== BaseProvider.prototype[capability];
  }

  unsupported(capability) {
    throw createError(
      `${capability} is not supported by the ${this.name} provider.`,
      'PROVIDER_CAPABILITY_UNSUPPORTED',
      400,
      { provider: this.name }
    );
  }
}

for (const capability of CAPABILITIES) {
  BaseProvider.prototype[capability] = async function unsupportedCapability() {
    return this.unsupported(capability);
  };
}

module.exports = BaseProvider;
