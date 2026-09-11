function successResponse(data = {}, meta = {}) {
  return {
    success: true,
    data,
    ...meta,
  };
}

function errorResponse(code, message, details = null) {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

module.exports = {
  successResponse,
  errorResponse,
};
