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
  errorResponse,
};
