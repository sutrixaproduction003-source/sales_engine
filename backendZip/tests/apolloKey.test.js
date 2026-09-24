jest.mock('axios', () => {
  const client = { post: jest.fn() };
  return { create: jest.fn(() => client), request: jest.fn(), __client: client };
});

delete process.env.APOLLO_API_KEY;

const axios = require('axios');
const request = require('supertest');
const app = require('../src/app');

describe('Apollo key from the app Settings', () => {
  test('without a key Apollo is reported as not configured', async () => {
    const res = await request(app).get('/api/crm/health');
    expect(res.body.providers.apollo.configured).toBe(false);
  });

  test('a forwarded key configures Apollo and is sent to Apollo', async () => {
    const health = await request(app).get('/api/crm/health').set('x-apollo-api-key', 'key-123');
    expect(health.body.providers.apollo.configured).toBe(true);

    axios.__client.post.mockResolvedValue({ status: 200, data: { people: [], total_entries: 0 } });
    const res = await request(app)
      .post('/api/leads/search')
      .set('x-apollo-api-key', 'key-123')
      .send({ provider: 'apollo', filters: { job_title: 'Medical Director', location: 'Chennai' } });

    expect(res.status).toBe(200);
    expect(axios.__client.post.mock.calls[0][2].headers['x-api-key']).toBe('key-123');
  });
});
