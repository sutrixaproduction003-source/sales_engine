const { errorResponse } = require('../utils/response');

/**
 * Convert any thrown error into the standard `{ success: false, error }` body.
 * Provider/API key wording is scrubbed so credentials never leak.
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = Number(err?.statusCode) || Number(err?.status) || 500;
  const safeStatus = statusCode >= 400 && statusCode <= 599 ? statusCode : 500;

  const message = String(err?.message || 'Internal server error')
    .replace(/x-api-key/gi, 'API key')
    .replace(/api[_ -]?key/gi, 'API key');

  res.status(safeStatus).json(errorResponse(err?.code || 'SERVER_ERROR', message));
}

module.exports = errorHandler;
