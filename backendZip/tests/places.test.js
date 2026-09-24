jest.mock('axios');

process.env.APIFY_TOKEN = 'test-token';

const axios = require('axios');
const request = require('supertest');
const app = require('../src/app');
const { buildPlacesInput, normalizePlace } = require('../src/services/placesService');

const PLACE = {
  title: 'Taj Exotica Resort & Spa',
  placeId: 'ChIJ123',
  categoryName: 'Resort hotel',
  categories: ['Resort hotel', 'Hotel'],
  address: 'Calwaddo, Benaulim, Goa 403716, India',
  city: 'Benaulim',
  state: 'Goa',
  countryCode: 'IN',
  location: { lat: 15.2517, lng: 73.9235 },
  phone: '+91 832 668 3333',
  website: 'https://www.tajhotels.com',
  totalScore: 4.6,
  reviewsCount: 5210,
  url: 'https://www.google.com/maps/place/?q=place_id:ChIJ123',
  emails: ['reservations@tajhotels.com'],
  instagrams: ['https://instagram.com/tajhotels'],
  searchString: 'resorts',
};

describe('placesService', () => {
  test('buildPlacesInput validates and caps input', () => {
    expect(() => buildPlacesInput({ location: '', searchTerms: ['hotels'] })).toThrow('Location is required.');
    expect(() => buildPlacesInput({ location: 'Goa', searchTerms: [' '] })).toThrow(/search term/);

    const input = buildPlacesInput({ location: ' Goa ', searchTerms: ['hotels', 'hotels', 'resorts'], maxPlacesPerTerm: 500 });
    expect(input).toMatchObject({
      locationQuery: 'Goa',
      searchStringsArray: ['hotels', 'resorts'],
      maxCrawledPlacesPerSearch: 100,
    });
  });

  test('normalizePlace maps a Google Maps item to a lead with exact coordinates', () => {
    expect(normalizePlace(PLACE)).toMatchObject({
      id: 'gmaps-ChIJ123',
      placeId: 'ChIJ123',
      companyName: 'Taj Exotica Resort & Spa',
      industry: 'Resort hotel',
      email: 'reservations@tajhotels.com',
      companyWebsite: 'https://www.tajhotels.com',
      exactAddress: 'Calwaddo, Benaulim, Goa 403716, India',
      location: 'Benaulim, Goa, IN',
      latitude: 15.2517,
      longitude: 73.9235,
      googleRating: 4.6,
      totalReviewsCount: 5210,
      instagramLink: 'https://instagram.com/tajhotels',
      source: 'google_maps',
    });
    expect(normalizePlace({ placeId: 'x' })).toBeNull();
  });
});

describe('/api/places/search', () => {
  afterEach(() => jest.resetAllMocks());

  test('POST starts a run and returns 202 with its id', async () => {
    axios.request.mockResolvedValue({ data: { data: { id: 'run-1', status: 'READY', defaultDatasetId: 'ds-1' } } });

    const res = await request(app).post('/api/places/search').send({ location: 'Goa', searchTerms: ['hotels'] });

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({ success: true, runId: 'run-1', status: 'READY' });
    expect(axios.request.mock.calls[0][0]).toMatchObject({
      method: 'post',
      url: 'https://api.apify.com/v2/acts/compass~crawler-google-places/runs',
    });
  });

  test('POST rejects a missing location', async () => {
    const res = await request(app).post('/api/places/search').send({ searchTerms: ['hotels'] });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PLACES_INPUT');
    expect(axios.request).not.toHaveBeenCalled();
  });

  test('GET reports a running scrape without places', async () => {
    axios.request.mockResolvedValue({ data: { data: { id: 'run-1', status: 'RUNNING', defaultDatasetId: 'ds-1' } } });

    const res = await request(app).get('/api/places/search/run-1');

    expect(res.body).toMatchObject({ success: true, done: false, status: 'RUNNING', places: [] });
  });

  test('GET returns deduplicated places once the run succeeded', async () => {
    axios.request
      .mockResolvedValueOnce({ data: { data: { id: 'run-1', status: 'SUCCEEDED', defaultDatasetId: 'ds-1' } } })
      .mockResolvedValueOnce({ data: [PLACE, PLACE, { title: '' }] });

    const res = await request(app).get('/api/places/search/run-1');

    expect(res.body.done).toBe(true);
    expect(res.body.places).toHaveLength(1);
    expect(res.body.places[0].latitude).toBe(15.2517);
  });

  test('GET maps a failed run to 502', async () => {
    axios.request.mockResolvedValue({ data: { data: { id: 'run-1', status: 'FAILED', defaultDatasetId: 'ds-1' } } });

    const res = await request(app).get('/api/places/search/run-1');

    expect(res.statusCode).toBe(502);
    expect(res.body.error.code).toBe('SCRAPER_FAILED');
  });
});
