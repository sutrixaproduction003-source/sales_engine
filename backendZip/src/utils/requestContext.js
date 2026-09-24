/**
 * Per-request settings forwarded by the Sales Engine app, e.g. an Apollo API
 * key saved on its Settings page (header `x-apollo-api-key`). Falls back to
 * backendZip/.env when absent.
 */

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

/** Express middleware: keep forwarded settings for the rest of the request. */
function requestContext(req, res, next) {
  const apolloApiKey = String(req.get('x-apollo-api-key') || '').trim();
  storage.run({ apolloApiKey }, () => next());
}

const currentContext = () => storage.getStore() || {};

module.exports = { requestContext, currentContext };
