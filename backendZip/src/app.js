const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const leadRoutes = require('./routes/leadRoutes');
const scraperRoutes = require('./routes/scraperRoutes');
const placesRoutes = require('./routes/placesRoutes');
const peopleRoutes = require('./routes/peopleRoutes');
const apolloRoutes = require('./routes/apolloRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const requireBackendKey = require('./middleware/requireBackendKey');
const logger = require('./utils/logger');
const { requestContext } = require('./utils/requestContext');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(requestContext);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit hit', {
      request: {
        method: req.method,
        url: req.originalUrl,
      },
      provider: req.body?.provider || 'unknown',
    });

    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
    });
  },
});

app.get('/', (req, res) => {
  res.json({ success: true, message: 'Sales Engine API is running.' });
});

app.use('/api', requireBackendKey);
app.use('/api', limiter);
app.use('/api', leadRoutes);
app.use('/api', scraperRoutes);
app.use('/api', placesRoutes);
app.use('/api', peopleRoutes);
app.use('/api', apolloRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
