# CRM Lead Enrichment Backend

This project provides a Node.js + Express backend for lead search and enrichment using Apollo behind a single provider API layer, plus Apify scrapers.

LinkedIn Sales Navigator is used from the frontend through search deep links (it has no public search API), so it needs no backend configuration.

## Installation

```bash
npm install
cp .env.example .env
```

## Environment variables

Create a `.env` file with values like:

```env
APOLLO_API_KEY=
APIFY_TOKEN=
PORT=5000
```

## Obtain API keys

### Apollo

1. Log in to Apollo and open Settings → Integrations → API.
2. Create an API key and save it in `.env` as `APOLLO_API_KEY`.
3. Keep the key server-side only.

## Start backend

```bash
npm start
```

For development:

```bash
npm run dev
```

## API endpoints

- `GET /api/crm/health`
- `POST /api/leads/search`
- `POST /api/leads/enrich`
- `POST /api/leads/email-finder`
- `POST /api/leads/email-verify`
- `POST /api/companies/search`
- `GET /api/providers/:provider/account`
- `PATCH /api/leads/:id/status`
- `POST /api/scrapers` (Apify: `instagram`, `facebook`, `googleMapsReviews`, `makemytripReviews`, `makemytripHotels`; needs `APIFY_TOKEN`)

The same scrapers are exposed as an MCP stdio server via `npm run mcp`.

## Example requests

### Search leads

```bash
curl -X POST http://localhost:5000/api/leads/search \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "apollo",
    "filters": { "job_title": "CEO" },
    "page": 1
  }'
```

### Enrich person

```bash
curl -X POST http://localhost:5000/api/leads/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "apollo",
    "firstName": "John",
    "lastName": "Doe",
    "companyWebsite": "example.com"
  }'
```

## Response format

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "PROVIDER_ERROR",
    "message": "Human-readable message"
  }
}
```

## Security recommendations

- Keep `.env` local and never commit it.
- Restrict CORS to trusted origins in production.
- Use authentication for internal API access.
- Avoid logging API keys or raw sensitive lead data.

## Email tools

`find-email` and `verify-email` are kept as stubs: no configured provider supports them, so they return `400 PROVIDER_CAPABILITY_UNSUPPORTED`. Apollo enrichment still returns emails where available.
