const path = require('path');

require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  apolloApiKey: process.env.APOLLO_API_KEY || '',
  apifyToken: process.env.APIFY_TOKEN || '',
  leadsDataDir: process.env.LEADS_DATA_DIR || path.join(__dirname, '..', '..', 'data'),
};
