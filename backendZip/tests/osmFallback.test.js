jest.mock('axios');

process.env.APIFY_TOKEN = 'test-token';

const axios = require('axios');
const request = require('supertest');
const app = require('../src/app');
const { selectorsFor, normalizeElement } = require('../src/services/osmPlaces');

const NOMINATIM_HIT = {
  data: [
    {
      lat: '15.4909',
      lon: '73.8278',
      boundingbox: ['15.45', '15.52', '73.78', '73.86'],
      address: { city: 'Panaji', state: 'Goa', country_code: 'in' },
    },
  ],
};

const OVERPASS_HOTELS = {
  data: {
    elements: [
      { type: 'node', id: 1, lat: 15.49, lon: 73.82, tags: { name: 'Bare Hotel', tourism: 'hotel' } },
      {
        type: 'way',
        id: 2,
        center: { lat: 15.5, lon: 73.83 },
        tags: {
          name: 'Hotel Mandovi',
          tourism: 'hotel',
          website: 'https://www.hotelmandovigoa.com',
          phone: '+91 832 242 6270',
          'contact:email': 'Reservations@hotelmandovigoa.com',
          'addr:street': 'DB Marg',
          'addr:city': 'Panaji',
        },
      },
    ],
  },
};

/** Route mocked axios calls: Apify, Nominatim, Overpass. */
function mockServices({ apify }) {
  axios.request.mockImplementation(async (config) => {
    if (config.url.includes('nominatim')) return NOMINATIM_HIT;
    if (config.url.includes('interpreter')) return OVERPASS_HOTELS;
    return apify(config);
  });
}

async function pollUntilDone(runId) {
  for (let i = 0; i < 40; i++) {
    const res = await request(app).get(`/api/places/search/${runId}`);
    if (res.body.done || res.status !== 200) return res;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('never finished');
}

jest.setTimeout(15000);
afterEach(() => jest.clearAllMocks());

describe('OpenStreetMap helpers', () => {
  test('maps project terms to OSM tags, and unknown terms to a name search', () => {
    const box = [1, 2, 3, 4];
    expect(selectorsFor('hotels', box).selectors).toContain('nwr["tourism"="hotel"]["name"](1,2,3,4);');
    expect(selectorsFor('hospitals', box).selectors).toEqual(['nwr["amenity"="hospital"]["name"](1,2,3,4);']);
    expect(selectorsFor('Taj Exotica', box).selectors).toEqual(['nwr["name"~"Taj Exotica",i](1,2,3,4);']);
    expect(selectorsFor('a"b', box).selectors[0]).toContain('a\\"b');
  });

  test('normalizes a way with a centre point and skips unnamed elements', () => {
    const area = { city: 'Panaji', state: 'Goa', country: 'IN' };
    const place = normalizeElement(OVERPASS_HOTELS.data.elements[1], { searchTerm: 'hotels', label: 'Hotel', area });
    expect(place).toMatchObject({
      id: 'osm-way-2',
      companyName: 'Hotel Mandovi',
      latitude: 15.5,
      longitude: 73.83,
      companyWebsite: 'https://www.hotelmandovigoa.com',
      exactAddress: 'DB Marg, Panaji',
      location: 'Panaji, Goa, IN',
      source: 'openstreetmap',
    });
    expect(normalizeElement({ type: 'node', id: 3, lat: 1, lon: 1, tags: {} }, { area })).toBeNull();
  });
});

describe('Places search falls back to OpenStreetMap', () => {
  test('invalid input is still rejected, not sent to OSM', async () => {
    const res = await request(app).post('/api/places/search').send({ location: '', searchTerms: ['hotels'] });
    expect(res.status).toBe(400);
    expect(axios.request).not.toHaveBeenCalled();
  });

  test('when Apify rejects the token', async () => {
    mockServices({
      apify: async () => Promise.reject(Object.assign(new Error('unauthorized'), { response: { status: 401, data: {} } })),
    });

    const start = await request(app).post('/api/places/search').send({ location: 'Panaji, Goa', searchTerms: ['hotels'] });
    expect(start.status).toBe(202);
    expect(start.body).toMatchObject({ source: 'openstreetmap', fallbackReason: 'Apify is not connected' });
    expect(start.body.runId).toMatch(/^fb-/);

    const res = await pollUntilDone(start.body.runId);
    expect(res.body).toMatchObject({ done: true, source: 'openstreetmap' });
    // Businesses with contact details come first; email is lower-cased and kept (same domain).
    expect(res.body.places.map((p) => p.companyName)).toEqual(['Hotel Mandovi', 'Bare Hotel']);
    expect(res.body.places[0]).toMatchObject({ email: 'reservations@hotelmandovigoa.com', searchTerm: 'hotels' });
    expect(res.body.places[0].rawEmails).toBeUndefined();
  });

  test('when Apify is out of credit', async () => {
    mockServices({
      apify: async () =>
        Promise.reject(Object.assign(new Error('x'), { response: { status: 402, data: { error: { message: 'Monthly usage hard limit exceeded' } } } })),
    });
    const start = await request(app).post('/api/places/search').send({ location: 'Panaji', searchTerms: ['hotels'] });
    expect(start.body).toMatchObject({ source: 'openstreetmap', fallbackReason: 'Apify is out of credit' });
  });

  test('when a started Google Maps run fails, under the same run id', async () => {
    mockServices({
      apify: async (config) => ({
        data: { data: { id: 'run-f', status: config.method === 'post' ? 'READY' : 'FAILED', defaultDatasetId: 'ds' } },
      }),
    });
    const start = await request(app).post('/api/places/search').send({ location: 'Panaji', searchTerms: ['hotels'] });
    expect(start.body).toMatchObject({ runId: 'run-f', source: 'google_maps' });

    const res = await pollUntilDone('run-f');
    expect(res.body).toMatchObject({ runId: 'run-f', done: true, source: 'openstreetmap' });
    expect(res.body.places).toHaveLength(2);
  });

  test('company lookups fall back too', async () => {
    mockServices({
      apify: async () => Promise.reject(Object.assign(new Error('unauthorized'), { response: { status: 403, data: {} } })),
    });
    const start = await request(app).post('/api/places/lookup').send({ queries: ['Hotel Mandovi, Panaji'] });
    expect(start.body).toMatchObject({ source: 'openstreetmap', queries: 1 });
    const res = await pollUntilDone(start.body.runId);
    expect(res.body.places).toHaveLength(1);
    expect(res.body.places[0].searchTerm).toBe('Hotel Mandovi, Panaji');
  });

});
