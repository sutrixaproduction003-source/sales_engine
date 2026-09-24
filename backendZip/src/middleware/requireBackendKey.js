const crypto = require('crypto');

/**
 * When BACKEND_API_KEY is set, only callers that send it (the Sales Engine
 * app, header `x-backend-key`) may use the API — it spends Apify and Apollo
 * credits. Unset (local development), the API stays open.
 */
function requireBackendKey(req, res, next) {
  const expected = (process.env.BACKEND_API_KEY || '').trim();
  if (!expected) return next();

  const given = String(req.get('x-backend-key') || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (crypto.timingSafeEqual(a, b)) return next();

  return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or wrong backend key.' } });
}

module.exports = requireBackendKey;
