const request = require('supertest');
const app = require('../src/app');

describe('CRM lead enrichment backend', () => {
  test('GET /api/crm/health returns provider configuration status', async () => {
    const res = await request(app).get('/api/crm/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.providers).toHaveProperty('apollo');
    expect(res.body.providers).not.toHaveProperty('hunter');
    expect(res.body.providers).not.toHaveProperty('prospeo');
  });

  test('POST /api/leads/search rejects unsupported provider', async () => {
    const res = await request(app)
      .post('/api/leads/search')
      .send({
        provider: 'unknown',
        filters: { job_title: 'CEO' },
        page: 1,
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/leads/email-finder validates input', async () => {
    const res = await request(app)
      .post('/api/leads/email-finder')
      .send({
        provider: 'apollo',
        firstName: 'John',
        lastName: 'Doe',
        domain: 'notadomain',
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('email tools (Apollo-only stubs)', () => {
  test.each([
    ['/api/leads/find-email', { firstName: 'John', lastName: 'Doe', domain: 'example.com' }],
    ['/api/leads/verify-email', { email: 'john@example.com' }],
  ])('%s reports the capability as unsupported', async (path, body) => {
    const res = await request(app).post(path).send({ provider: 'apollo', ...body });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('PROVIDER_CAPABILITY_UNSUPPORTED');
  });

  test('removed providers are rejected', async () => {
    const res = await request(app).post('/api/leads/search').send({ provider: 'prospeo', filters: {} });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_PROVIDER');
  });
});
