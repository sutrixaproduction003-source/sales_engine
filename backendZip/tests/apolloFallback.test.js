jest.mock('axios', () => {
  const client = { post: jest.fn(), get: jest.fn() };
  return { create: jest.fn(() => client), request: jest.fn(), __client: client };
});

process.env.APIFY_TOKEN = 'test-token';
delete process.env.APOLLO_API_KEY;

const axios = require('axios');
const request = require('supertest');
const app = require('../src/app');

const client = axios.__client;
const KEY = { 'x-apollo-api-key': 'key-1' };

const ORGS = [
  {
    id: 'o1',
    name: 'MIOT International',
    website_url: 'http://www.miotinternational.com',
    sanitized_phone: '+914442002288',
    linkedin_url: 'http://www.linkedin.com/company/miot',
    raw_address: '4/112, Mount Poonamallee Road, Manapakkam, Chennai, Tamil Nadu 600089, India',
    city: 'Chennai',
    industry: 'hospital & health care',
  },
  { id: 'o2', name: 'Kauvery Hospital', primary_domain: 'kauveryhospital.com', city: 'Chennai' },
];

/** Apify is down; Nominatim and Overpass answer; Apollo returns ORGS. */
function mockServices({ apolloOrgs = ORGS } = {}) {
  axios.request.mockImplementation(async (config) => {
    if (config.url.includes('nominatim')) {
      if (config.params.q.includes('Poonamallee')) return { data: [{ lat: '13.0213', lon: '80.1856' }] };
      return { data: [{ lat: '13.0827', lon: '80.2707', boundingbox: ['12.9', '13.2', '80.1', '80.35'], address: { city: 'Chennai', country_code: 'in' } }] };
    }
    if (config.url.includes('interpreter')) {
      return { data: { elements: [{ type: 'node', id: 7, lat: 13.05, lon: 80.25, tags: { name: 'OSM Clinic', amenity: 'clinic' } }] } };
    }
    throw Object.assign(new Error('unauthorized'), { response: { status: 401, data: {} } });
  });
  client.post.mockImplementation(async (path) =>
    path === '/mixed_companies/search' ? { status: 200, data: { organizations: apolloOrgs } } : { status: 404, data: {} }
  );
}

async function pollUntilDone(runId) {
  for (let i = 0; i < 60; i++) {
    const res = await request(app).get(`/api/places/search/${runId}`).set(KEY);
    if (res.body.done || res.status !== 200) return res;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('never finished');
}

jest.setTimeout(20000);
afterEach(() => jest.clearAllMocks());

describe('Apollo as the lead-scraping fallback', () => {
  test('with an Apollo key, a failed Google Maps search uses Apollo companies', async () => {
    mockServices();
    const start = await request(app).post('/api/places/search').set(KEY).send({ location: 'Chennai, India', searchTerms: ['hospitals'] });
    expect(start.status).toBe(202);
    expect(start.body).toMatchObject({ source: 'apollo', fallbackReason: 'Apify is not connected' });

    const res = await pollUntilDone(start.body.runId);
    expect(res.body).toMatchObject({ done: true, source: 'apollo' });
    expect(client.post.mock.calls[0][1]).toMatchObject({
      organization_locations: ['Chennai, India'],
      q_organization_keyword_tags: ['hospitals', 'hospital'],
      per_page: 20,
    });

    const [miot, kauvery] = res.body.places;
    // Address geocoded to an exact pin; no address → approximate pin near the city centre.
    expect(miot).toMatchObject({
      id: 'apollo-o1',
      companyName: 'MIOT International',
      phone: '+914442002288',
      companyWebsite: 'http://www.miotinternational.com',
      latitude: 13.0213,
      longitude: 80.1856,
      locationApproximate: false,
      source: 'apollo',
      searchTerm: 'hospitals',
    });
    expect(kauvery).toMatchObject({ companyWebsite: 'https://kauveryhospital.com', locationApproximate: true });
    expect(Math.abs(kauvery.latitude - 13.0827)).toBeLessThan(0.01);
  });

  test('when Apollo finds nothing, OpenStreetMap is used', async () => {
    mockServices({ apolloOrgs: [] });
    const start = await request(app).post('/api/places/search').set(KEY).send({ location: 'Chennai', searchTerms: ['clinics'] });
    const res = await pollUntilDone(start.body.runId);
    expect(res.body.source).toBe('openstreetmap');
    expect(res.body.fallbackReason).toMatch(/Apollo found no companies/);
    expect(res.body.places.map((p) => p.companyName)).toEqual(['OSM Clinic']);
  });

  test('without an Apollo key it goes straight to OpenStreetMap', async () => {
    mockServices();
    const start = await request(app).post('/api/places/search').send({ location: 'Chennai', searchTerms: ['clinics'] });
    expect(start.body.source).toBe('openstreetmap');
    await pollUntilDone(start.body.runId);
    expect(client.post).not.toHaveBeenCalled();
  });

  test('company lookups use Apollo by name + city', async () => {
    mockServices({ apolloOrgs: [ORGS[0]] });
    const start = await request(app).post('/api/places/lookup').set(KEY).send({ queries: ['MIOT International, Chennai'] });
    const res = await pollUntilDone(start.body.runId);
    expect(client.post.mock.calls[0][1]).toMatchObject({ q_organization_name: 'MIOT International', organization_locations: ['Chennai'], per_page: 1 });
    expect(res.body.places[0]).toMatchObject({ companyName: 'MIOT International', searchTerm: 'MIOT International, Chennai' });
  });
});

describe('Google Maps finds nothing', () => {
  test('an empty Google Maps result falls back to Apollo under the same run id', async () => {
    mockServices();
    axios.request.mockImplementation(async (config) => {
      if (config.url.includes('nominatim')) {
        return { data: [{ lat: '13.0827', lon: '80.2707', boundingbox: ['12.9', '13.2', '80.1', '80.35'], address: { city: 'Chennai' } }] };
      }
      if (config.url.includes('/runs') && config.method === 'post') return { data: { data: { id: 'run-empty', status: 'READY', defaultDatasetId: 'ds-e' } } };
      if (config.url.includes('/actor-runs/')) return { data: { data: { id: 'run-empty', status: 'SUCCEEDED', defaultDatasetId: 'ds-e' } } };
      if (config.url.includes('/datasets/')) return { data: [] };
      throw new Error(`unexpected ${config.url}`);
    });
    const start = await request(app).post('/api/places/search').set(KEY).send({ location: 'Chennai', searchTerms: ['hospitals'] });
    expect(start.body).toMatchObject({ runId: 'run-empty', source: 'google_maps' });
    const res = await pollUntilDone('run-empty');
    expect(res.body).toMatchObject({ runId: 'run-empty', done: true, source: 'apollo', fallbackReason: 'Google Maps found no businesses' });
    expect(res.body.places.length).toBe(2);
  });
});
