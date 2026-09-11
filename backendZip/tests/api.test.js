const request = require('supertest');
const app = require('../src/app');

describe('CRM lead enrichment backend', () => {
  test('GET /api/crm/health returns provider configuration status', async () => {
    const res = await request(app).get('/api/crm/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.providers).toHaveProperty('prospeo');
    expect(res.body.providers).toHaveProperty('hunter');
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
        provider: 'hunter',
        firstName: 'John',
        lastName: 'Doe',
        domain: 'notadomain',
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
