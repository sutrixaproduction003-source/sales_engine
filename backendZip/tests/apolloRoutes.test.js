jest.mock('axios', () => {
  const client = { post: jest.fn(), get: jest.fn() };
  return { create: jest.fn(() => client), request: jest.fn(), __client: client };
});

process.env.APOLLO_API_KEY = 'env-key';

const axios = require('axios');
const request = require('supertest');
const app = require('../src/app');

const client = axios.__client;
afterEach(() => jest.clearAllMocks());

describe('Apollo lead search', () => {
  test('searches by location, titles and keywords', async () => {
    client.post.mockResolvedValue({
      status: 200,
      data: {
        total_entries: 1,
        people: [{ id: 'p1', first_name: 'Asha', last_name_obfuscated: 'Ra***n', title: 'Medical Director', has_email: true, organization: { name: 'MIOT' } }],
      },
    });
    const res = await request(app)
      .post('/api/apollo/search')
      .send({ location: 'Chennai, India', titles: ['Medical Director', 'CEO'], keywords: 'hospital' });

    expect(res.status).toBe(200);
    expect(client.post.mock.calls[0][1]).toMatchObject({
      person_locations: ['Chennai, India'],
      person_titles: ['Medical Director', 'CEO'],
      include_similar_titles: true,
      q: 'hospital',
      per_page: 25,
    });
    expect(res.body.people[0]).toMatchObject({ id: 'p1', firstName: 'Asha', jobTitle: 'Medical Director', companyName: 'MIOT' });
  });

  test('requires a location', async () => {
    const res = await request(app).post('/api/apollo/search').send({ titles: ['CEO'] });
    expect(res.status).toBe(400);
  });
});

describe('Apollo reveal + mobile numbers', () => {
  test('reveals a Sales Navigator lead by name + company and keeps the 64-bit phone request id exact', async () => {
    client.post.mockResolvedValue({
      status: 200,
      data: '{"request_id": 1039995589705121900, "person": {"id": "p9", "first_name": "Sandeep", "last_name": "Narkhede", "name": "Sandeep Narkhede", "title": "Plant Head", "email": "sandeep@shardamotor.com", "organization": {"name": "Sharda Motor", "primary_domain": "shardamotor.com"}}}',
    });

    const res = await request(app)
      .post('/api/apollo/reveal')
      .send({ firstName: 'Sandeep', lastName: 'Narkhede', organizationName: 'Sharda Motor', revealPhone: true });

    expect(res.status).toBe(200);
    expect(client.post.mock.calls[0][2].params).toMatchObject({
      first_name: 'Sandeep',
      last_name: 'Narkhede',
      organization_name: 'Sharda Motor',
      reveal_phone_number: true,
      poll_only: true,
    });
    expect(client.post.mock.calls[0][2].params.webhook_url).toBeUndefined();
    expect(res.body).toMatchObject({ matched: true, phoneRequestId: '1039995589705121900' });
    expect(res.body.lead).toMatchObject({ email: 'sandeep@shardamotor.com', fullName: 'Sandeep Narkhede' });
  });

  test('collects phones: pending, found (mobile first) and failed', async () => {
    client.get.mockImplementation(async (path) => {
      if (path.endsWith('/1')) return { status: 404, data: { error_code: 'result_pending', retry_after_seconds: 5 } };
      if (path.endsWith('/2')) {
        return {
          status: 200,
          data: {
            webhook_status: 'success',
            webhook_result: {
              people: [
                {
                  id: 'p9',
                  phone_numbers: [
                    { sanitized_number: '+912135674400', type_cd: 'work_hq', status_cd: 'valid_number' },
                    { sanitized_number: '+919822000000', type_cd: 'mobile', status_cd: 'valid_number' },
                  ],
                },
              ],
            },
          },
        };
      }
      return { status: 410, data: { error_code: 'request_id_expired' } };
    });

    const res = await request(app).post('/api/apollo/phones').send({ requestIds: ['1', '2', '3'] });
    expect(res.body.results['1']).toMatchObject({ status: 'pending' });
    expect(res.body.results['2']).toMatchObject({ status: 'found', phone: '+919822000000' });
    expect(res.body.results['3']).toMatchObject({ status: 'failed', reason: 'request_id_expired' });
  });
});
