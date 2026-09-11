const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate the file-backed store for this test run (must be set before the
// repository module is loaded, since it resolves its data dir at require time).
process.env.LEADS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sales-engine-leads-'));

const request = require('supertest');
const app = require('../src/app');
const leadRepository = require('../src/repositories/leadRepository');

describe('PATCH /api/leads/:id/status', () => {
  test('updates the status of an existing lead', async () => {
    leadRepository.upsertMany([{ id: 'status-test-1', email: 'status-test-1@example.com' }]);

    const res = await request(app)
      .patch('/api/leads/status-test-1/status')
      .send({ status: 'QUALIFIED' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('status-test-1');
    expect(res.body.data.status).toBe('QUALIFIED');
    expect(leadRepository.findById('status-test-1').status).toBe('QUALIFIED');
  });

  test('rejects an invalid status with 400', async () => {
    leadRepository.upsertMany([{ id: 'status-test-2', email: 'status-test-2@example.com' }]);

    const res = await request(app)
      .patch('/api/leads/status-test-2/status')
      .send({ status: 'ARCHIVED' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(leadRepository.findById('status-test-2').status).toBe('NEW');
  });

  test('returns 404 for an unknown lead id', async () => {
    const res = await request(app)
      .patch('/api/leads/does-not-exist/status')
      .send({ status: 'NEW' });

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
