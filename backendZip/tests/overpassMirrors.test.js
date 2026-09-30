jest.mock('axios');

const axios = require('axios');
const { searchOsm } = require('../src/services/osmPlaces');

const NOMINATIM = { data: [{ lat: '15.49', lon: '73.82', boundingbox: ['15.45', '15.52', '73.78', '73.86'], address: { city: 'Panaji' } }] };
const HOTEL = { type: 'node', id: 1, lat: 15.49, lon: 73.82, tags: { name: 'Hotel Mandovi', tourism: 'hotel' } };

afterEach(() => jest.clearAllMocks());

test('uses whichever mirror answers when the main one is overloaded', async () => {
  axios.request.mockImplementation(async (config) => {
    if (config.url.includes('nominatim')) return NOMINATIM;
    if (config.url.includes('overpass-api.de')) throw Object.assign(new Error('Gateway Timeout'), { response: { status: 504 } });
    if (config.url.includes('mail.ru')) return { data: { elements: [HOTEL] } };
    throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
  });
  const places = await searchOsm({ location: 'Panaji', searchTerms: ['hotels'], perTerm: 5 }, (p) => p);
  expect(places.map((p) => p.companyName)).toEqual(['Hotel Mandovi']);
  // All mirrors were asked at the same time, not one after another.
  const mirrors = axios.request.mock.calls.map((c) => c[0].url).filter((u) => u.includes('interpreter'));
  expect(mirrors.length).toBe(4);
});

test('retries when every mirror fails at first', async () => {
  let overpassCalls = 0;
  axios.request.mockImplementation(async (config) => {
    if (config.url.includes('nominatim')) return NOMINATIM;
    overpassCalls++;
    if (overpassCalls <= 4) throw Object.assign(new Error('Gateway Timeout'), { response: { status: 504 } });
    return { data: { elements: [HOTEL] } };
  });
  const places = await searchOsm({ location: 'Panaji, Goa', searchTerms: ['hotels'], perTerm: 5 }, (p) => p);
  expect(places).toHaveLength(1);
}, 15000);

test('a busy mirror ("runtime error" with no results) is not taken as "nothing found"', async () => {
  axios.request.mockImplementation(async (config) => {
    if (config.url.includes('nominatim')) return NOMINATIM;
    if (config.url.includes('overpass-api.de')) {
      return { data: { elements: [], remark: 'runtime error: open64: 0 Success /osm3s_osm_base Dispatcher_Client::request_read_and_idx::timeout. The server is probably too busy to handle your request.' } };
    }
    if (config.url.includes('mail.ru')) {
      await new Promise((r) => setTimeout(r, 30));
      return { data: { elements: [HOTEL] } };
    }
    throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
  });
  const places = await searchOsm({ location: 'Panaji', searchTerms: ['hotels'], perTerm: 5 }, (p) => p);
  expect(places.map((p) => p.companyName)).toEqual(['Hotel Mandovi']);
});

test('company lookup matches a shorter OSM name ("Grand Hyatt" for "Grand Hyatt Goa") but not a loose one', async () => {
  const { lookupOsm } = require('../src/services/osmPlaces');
  axios.request.mockImplementation(async (config) => {
    if (config.url.includes('nominatim')) return NOMINATIM;
    return {
      data: {
        elements: [
          { type: 'node', id: 7, lat: 15.45, lon: 73.85, tags: { name: 'Hyatt Pharmacy', shop: 'chemist' } },
          { type: 'node', id: 8, lat: 15.46, lon: 73.86, tags: { name: 'Grand Hyatt', tourism: 'hotel' } },
        ],
      },
    };
  });
  const places = await lookupOsm(['Grand Hyatt Goa, Bambolim'], (p) => p);
  expect(places.map((p) => p.companyName)).toEqual(['Grand Hyatt']);
  const query = decodeURIComponent(axios.request.mock.calls.find((c) => c[0].url.includes('interpreter'))[0].data);
  expect(query).toContain('Grand Hyatt Goa|Grand Hyatt');
});
