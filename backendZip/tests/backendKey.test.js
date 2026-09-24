const request = require('supertest');
const app = require('../src/app');

afterEach(() => delete process.env.BACKEND_API_KEY);

describe('BACKEND_API_KEY', () => {
  test('without a key configured, the API is open (local development)', async () => {
    const res = await request(app).get('/api/crm/health');
    expect(res.status).toBe(200);
  });

  test('with a key configured, calls without it or with a wrong one are refused', async () => {
    process.env.BACKEND_API_KEY = 'secret-123';
    expect((await request(app).get('/api/crm/health')).status).toBe(401);
    expect((await request(app).get('/api/crm/health').set('x-backend-key', 'nope')).status).toBe(401);
    expect((await request(app).get('/api/crm/health').set('x-backend-key', 'secret-123')).status).toBe(200);
  });

  test('the health check at / stays open for the host', async () => {
    process.env.BACKEND_API_KEY = 'secret-123';
    expect((await request(app).get('/')).status).toBe(200);
  });
});
