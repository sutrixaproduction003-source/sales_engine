const { errorResponse } = require('../utils/response');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json(
    errorResponse(err.code || 'SERVER_ERROR', message)
  );
}

module.exports = errorHandler;
