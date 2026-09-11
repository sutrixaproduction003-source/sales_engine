require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  prospeoApiKey: process.env.PROSPEO_API_KEY || '',
  hunterApiKey: process.env.HUNTER_API_KEY || '',
  apolloApiKey: process.env.APOLLO_API_KEY || '',
  nodeEnv: process.env.NODE_ENV || 'development',
};
