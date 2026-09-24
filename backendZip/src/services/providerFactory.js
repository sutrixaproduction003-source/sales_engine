/**
 * Central registry of Sales Engine data providers. One instance per provider
 * is created at startup so axios clients are reused across requests.
 */

const ProspeoProvider = require('./providers/ProspeoProvider');
const HunterProvider = require('./providers/HunterProvider');
const ApolloProvider = require('./providers/ApolloProvider');
const { createError } = require('../utils/errors');

const providers = {
  prospeo: new ProspeoProvider(),
  hunter: new HunterProvider(),
  apollo: new ApolloProvider(),
};

const SUPPORTED = Object.keys(providers).join(', ');

/** "Apollo" / " APOLLO " -> "apollo" */
function normalizeProviderName(providerName) {
  return providerName === undefined || providerName === null ? '' : String(providerName).trim().toLowerCase();
}

/**
 * Return a provider instance by name. Throws a 400 error for a missing or
 * unknown provider.
 */
function getProvider(providerName) {
  const name = normalizeProviderName(providerName);

  if (!name) {
    throw createError(`Provider is required. Supported providers: ${SUPPORTED}.`, 'PROVIDER_REQUIRED', 400);
  }

  const provider = providers[name];
  if (!provider) {
    throw createError(
      `Unsupported provider "${providerName}". Supported providers: ${SUPPORTED}.`,
      'UNSUPPORTED_PROVIDER',
      400,
      { provider: name }
    );
  }

  return provider;
}

/** Configuration status of every provider, keyed by name. Never exposes keys. */
function getProviderStatuses() {
  return Object.fromEntries(
    Object.entries(providers).map(([name, provider]) => [name, { configured: provider.isConfigured() }])
  );
}

module.exports = {
  normalizeProviderName,
  getProvider,
  getProviderStatuses,
};
