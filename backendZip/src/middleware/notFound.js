const { errorResponse } = require('../utils/response');

function notFound(req, res) {
  res.status(404).json(
    errorResponse('NOT_FOUND', 'Route not found.')
  );
}

module.exports = notFound;
