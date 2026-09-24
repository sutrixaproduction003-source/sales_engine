jest.mock('axios');

process.env.APIFY_TOKEN = 'test-token';

const axios = require('axios');
const request = require('supertest');
const app = require('../src/app');
const { buildQueries, parseProfile, rankPeople } = require('../src/services/peopleService');

const profile = (title, description = '', slug = 'priya-sharma') => ({
  title,
  url: `https://in.linkedin.com/in/${slug}?trk=x`,
  description,
});

describe('peopleService parsing', () => {
  test('buildQueries targets LinkedIn profiles for the business and roles', () => {
    expect(buildQueries('Taj Exotica', 'Goa, India', ['General Manager', 'Owner', 'Director', 'Manager'])).toEqual([
      'site:linkedin.com/in "Taj Exotica" Goa',
      'site:linkedin.com/in "Taj Exotica" "General Manager"',
      'site:linkedin.com/in "Taj Exotica" "Owner"',
      'site:linkedin.com/in "Taj Exotica" "Director"',
    ]);
  });

  test.each([
    ['Priya Sharma - General Manager - Taj Exotica Resort & Spa | LinkedIn', 'Priya Sharma', 'General Manager', 'Taj Exotica Resort & Spa'],
    ['Priya Sharma – Director of Sales at Taj Hotels – LinkedIn', 'Priya Sharma', 'Director of Sales', 'Taj Hotels'],
    ['Priya Sharma - Taj Exotica Resort & Spa | LinkedIn', 'Priya Sharma', 'Taj Exotica Resort & Spa', ''],
  ])('parses "%s"', (title, name, jobTitle, company) => {
    expect(parseProfile(profile(title))).toMatchObject({
      name,
      jobTitle,
      company,
      linkedinUrl: 'https://in.linkedin.com/in/priya-sharma',
      source: 'linkedin_search',
    });
  });

  test('takes the title from the snippet when the result title has none', () => {
    expect(parseProfile(profile('Priya Sharma | LinkedIn', 'Revenue Manager at Taj Exotica · Goa')).jobTitle).toBe(
      'Revenue Manager'
    );
  });

  test('prefers the "<title> at <company>" snippet and tidies name casing', () => {
    expect(
      parseProfile(
        profile('ganesh Chandra - Taj exotica resort & spa goa | LinkedIn', 'Junior Sous Chef at Taj exotica resort & spa goa · Experience: …')
      )
    ).toMatchObject({ name: 'Ganesh Chandra', jobTitle: 'Junior Sous Chef', company: 'Taj exotica resort & spa goa' });
    expect(parseProfile(profile('SHEETAL SINGH - Cluster General Manager | LinkedIn')).name).toBe('Sheetal Singh');
  });

  test('rankPeople splits a business name out of the job title', () => {
    const [person] = rankPeople(
      [{ name: 'R', jobTitle: 'Director Of Rooms Taj Exotica Resort & ...', company: '', snippet: '' }],
      'Taj Exotica Resort & Spa',
      []
    );
    expect(person).toMatchObject({ jobTitle: 'Director Of Rooms', company: 'Taj Exotica Resort & ...', worksThere: true });
  });

  test('cleans leading punctuation, "Currently…" titles and run-on company text', () => {
    expect(
      parseProfile(profile('Karthik Reddy | LinkedIn', '. Project Manager at Apollo Hospitals. Apollo Hospitals Jubilee Hills. Hyderabad.Read more'))
    ).toMatchObject({ jobTitle: 'Project Manager', company: 'Apollo Hospitals' });
    expect(
      parseProfile(profile('Sai Keerthi | LinkedIn', 'Currently, I am an Information Technology Intern at Apollo Hospitals · x')).jobTitle
    ).toBe('Information Technology Intern');
    expect(parseProfile(profile('A B | LinkedIn', 'Nurse at St. John\'s Hospital · Bengaluru')).company).toBe("St. John's Hospital");
  });

  test("pickBusiness prefers the main listing over a sub-place", () => {
    const { pickBusiness } = require("../src/services/peopleService");
    const gate = { companyName: "Apollo Hospitals Jubilee Hills Main Gate", totalReviewsCount: 84 };
    const main = { companyName: "Apollo Hospitals, Jubilee Hills", totalReviewsCount: 12000 };
    const other = { companyName: "City Clinic", totalReviewsCount: 50000 };
    expect(pickBusiness([gate, other, main], "Apollo Hospitals Jubilee Hills")).toBe(main);
  });

  test('ignores non-profile results', () => {
    expect(parseProfile({ title: 'Taj Exotica | LinkedIn', url: 'https://www.linkedin.com/company/taj' })).toBeNull();
  });

  test('rankPeople puts people at the business and senior roles first', () => {
    const people = [
      { name: 'A', jobTitle: 'Chef', company: 'Other Hotel', snippet: '' },
      { name: 'B', jobTitle: 'Front Office Manager', company: 'Taj Exotica', snippet: '' },
      { name: 'C', jobTitle: 'General Manager', company: 'Taj Exotica', snippet: '' },
      { name: 'D', jobTitle: 'Former General Manager', company: 'Taj Exotica', snippet: '' },
    ];
    const ranked = rankPeople(people, 'Taj Exotica Resort & Spa', ['General Manager', 'Front Office Manager']);
    expect(ranked.map((p) => p.name)).toEqual(['C', 'B', 'D', 'A']);
    expect(ranked[0]).toMatchObject({ worksThere: true, matchedRole: 'General Manager', possiblyFormer: false });
    expect(ranked[2].possiblyFormer).toBe(true);
    expect(ranked[3].worksThere).toBe(false);
  });
});

describe('/api/people/search', () => {
  afterEach(() => jest.resetAllMocks());

  test('POST starts both runs and returns a combined job id', async () => {
    axios.request
      .mockResolvedValueOnce({ data: { data: { id: 'place1', status: 'READY', defaultDatasetId: 'd1' } } })
      .mockResolvedValueOnce({ data: { data: { id: 'search1', status: 'READY', defaultDatasetId: 'd2' } } });

    const res = await request(app).post('/api/people/search').send({ business: 'Taj Exotica', location: 'Goa' });

    expect(res.statusCode).toBe(202);
    expect(res.body.jobId).toBe('place1.search1');
    const urls = axios.request.mock.calls.map((c) => c[0].url);
    expect(urls).toEqual(expect.arrayContaining([expect.stringContaining('crawler-google-places'), expect.stringContaining('google-search-scraper')]));
  });

  test('POST requires a business name', async () => {
    const res = await request(app).post('/api/people/search').send({ location: 'Goa' });
    expect(res.statusCode).toBe(400);
  });

  test('GET returns the business and ranked people when both runs are done', async () => {
    axios.request.mockImplementation(async ({ url }) => {
      if (url.includes('/actor-runs/place1')) return { data: { data: { id: 'place1', status: 'SUCCEEDED', defaultDatasetId: 'd1' } } };
      if (url.includes('/actor-runs/search1')) return { data: { data: { id: 'search1', status: 'SUCCEEDED', defaultDatasetId: 'd2' } } };
      if (url.includes('/datasets/d1/'))
        return { data: [{ title: 'Taj Exotica Resort & Spa', placeId: 'p1', location: { lat: 15.25, lng: 73.92 }, website: 'https://tajhotels.com' }] };
      if (url.includes('/datasets/d2/'))
        return {
          data: [
            { organicResults: [
              profile('Priya Sharma - General Manager - Taj Exotica Resort & Spa | LinkedIn'),
              profile('Priya Sharma - General Manager - Taj Exotica Resort & Spa | LinkedIn'),
              { title: 'Taj Exotica reviews', url: 'https://tripadvisor.com/x' },
            ] },
          ],
        };
      throw new Error(`unexpected ${url}`);
    });

    const res = await request(app).get('/api/people/search/place1.search1?business=Taj%20Exotica&roles=General%20Manager');

    expect(res.statusCode).toBe(200);
    expect(res.body.done).toBe(true);
    expect(res.body.business).toMatchObject({ companyName: 'Taj Exotica Resort & Spa', latitude: 15.25 });
    expect(res.body.people).toHaveLength(1);
    expect(res.body.people[0]).toMatchObject({ name: 'Priya Sharma', jobTitle: 'General Manager', worksThere: true });
  });

  test('GET reports progress while a run is still going', async () => {
    axios.request.mockResolvedValue({ data: { data: { id: 'x', status: 'RUNNING', defaultDatasetId: 'd' } } });
    const res = await request(app).get('/api/people/search/place1.search1');
    expect(res.body).toMatchObject({ done: false, progress: { business: 'RUNNING', people: 'RUNNING' } });
  });
});
