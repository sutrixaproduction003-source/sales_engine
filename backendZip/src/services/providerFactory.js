/**
 * Provider Factory
 *
 * Central registry for all Sales Engine data providers.
 *
 * Supported providers:
 *   - Prospeo
 *   - Hunter
 *   - Apollo
 *
 * Usage:
 *
 *   const providerFactory = require('./providerFactory');
 *
 *   const provider = providerFactory.getProvider('apollo');
 *
 * The factory returns a single initialized provider instance.
 */

const ProspeoProvider = require('./providers/ProspeoProvider');
const HunterProvider = require('./providers/HunterProvider');
const ApolloProvider = require('./providers/ApolloProvider');

/**
 * Create one instance of each provider.
 *
 * Keeping provider instances here avoids repeatedly creating
 * Axios clients / provider objects for every request.
 */
const providers = {
  prospeo: new ProspeoProvider(),
  hunter: new HunterProvider(),
  apollo: new ApolloProvider(),
};

/**
 * Normalize provider names coming from the frontend/backend.
 *
 * Examples:
 *   "Apollo"  -> "apollo"
 *   "APOLLO"  -> "apollo"
 *   "apollo"  -> "apollo"
 */
function normalizeProviderName(providerName) {
  if (providerName === undefined || providerName === null) {
    return "";
  }

  return String(providerName).trim().toLowerCase();
}

/**
 * Return a provider instance by name.
 *
 * @param {string} providerName
 * @returns {object}
 */
function getProvider(providerName) {
  const normalizedName = normalizeProviderName(providerName);

  if (!normalizedName) {
    const error = new Error(
      "Provider is required. Supported providers: prospeo, hunter, apollo."
    );

    error.code = "PROVIDER_REQUIRED";
    error.statusCode = 400;

    throw error;
  }

  const provider = providers[normalizedName];

  if (!provider) {
    const error = new Error(
      `Unsupported provider "${providerName}". Supported providers: prospeo, hunter, apollo.`
    );

    error.code = "UNSUPPORTED_PROVIDER";
    error.statusCode = 400;
    error.provider = normalizedName;

    throw error;
  }

  return provider;
}

/**
 * Check whether a provider exists in the factory.
 *
 * @param {string} providerName
 * @returns {boolean}
 */
function hasProvider(providerName) {
  const normalizedName = normalizeProviderName(providerName);

  return Boolean(normalizedName && providers[normalizedName]);
}

/**
 * Return the names of all registered providers.
 *
 * @returns {string[]}
 */
function getProviderNames() {
  return Object.keys(providers);
}

/**
 * Return a simple provider configuration/status object.
 *
 * This does not expose API keys.
 */
function getProviderStatus(providerName) {
  const provider = getProvider(providerName);

  return {
    name: normalizeProviderName(providerName),
    configured:
      typeof provider.isConfigured === "function"
        ? provider.isConfigured()
        : true,
  };
}

module.exports = {
  providers,
  getProvider,
  hasProvider,
  getProviderNames,
  getProviderStatus,
};