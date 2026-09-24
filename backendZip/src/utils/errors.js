/**
 * Build an Error carrying the fields the error handler understands.
 */
function createError(message, code, statusCode = 500, extra = {}) {
  return Object.assign(new Error(message), { code, statusCode, ...extra });
}

/**
 * Wrap an async route handler so rejections reach the error middleware.
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = { createError, asyncHandler };
