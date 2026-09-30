jest.mock('axios', () => {
  const client = { post: jest.fn(), get: jest.fn() };
  return { create: jest.fn(() => client), request: jest.fn(), __client: client };
});

process.env.APIFY_TOKEN = 'apify-test';
delete process.env.APOLLO_API_KEY;

const axios = require('axios');
const request = require('supertest');
const app = require('../src/app');

afterEach(() => jest.clearAllMocks());

test('reports Apify account and Apollo key status without spending credits', async () => {
  axios.request.mockResolvedValue({ data: { data: { username: 'sutrixa', plan: { id: 'FREE' } } } });
  axios.__client.post.mockResolvedValue({ status: 200, data: { people: [], total_entries: 1234 } });

  const res = await request(app).get('/api/health/live').set('x-apollo-api-key', 'apollo-test');
  expect(res.status).toBe(200);
  expect(res.body.apify).toEqual({ status: 'ok', detail: 'Signed in as sutrixa (FREE plan)' });
  expect(res.body.apollo.status).toBe('ok');
  expect(axios.request.mock.calls[0][0].url).toMatch(/\/users\/me$/);
  // The Apollo check is a free people search for one result.
  expect(axios.__client.post.mock.calls[0][0]).toBe('/mixed_people/api_search');
  expect(axios.__client.post.mock.calls[0][1].per_page).toBe(1);
});

test('a rejected key or a missing key is reported, not thrown', async () => {
  axios.request.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 401, data: { error: { message: 'bad token' } } } }));
  const res = await request(app).get('/api/health/live');
  expect(res.body.apify).toMatchObject({ status: 'fail', detail: expect.stringMatching(/rejected the token/) });
  expect(res.body.apollo).toEqual({ status: 'not_configured', detail: 'No key set' });
});
