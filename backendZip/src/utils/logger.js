const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', '..', 'logs');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const log = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const payload = {
    timestamp,
    level,
    message,
    ...meta,
  };

  const sanitized = {
    ...payload,
  };

  if (sanitized.request && sanitized.request.headers) {
    sanitized.request.headers = {
      ...sanitized.request.headers,
      authorization: '[REDACTED]',
      'x-api-key': '[REDACTED]',
    };
  }

  if (sanitized.meta && sanitized.meta.apiKey) {
    sanitized.meta.apiKey = '[REDACTED]';
  }

  const line = `${JSON.stringify(sanitized)}\n`;
  fs.appendFileSync(path.join(logDir, 'backend.log'), line, 'utf8');
};

module.exports = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};
