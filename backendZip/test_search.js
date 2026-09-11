const ProspeoProvider = require('./src/services/providers/ProspeoProvider');
const provider = new ProspeoProvider();
provider.searchPeople({ location: 'United States' })
  .then(r => console.log('SUCCESS:', JSON.stringify(r).substring(0, 300)))
  .catch(e => console.log('ERROR:', e.code, e.message, e.statusCode));