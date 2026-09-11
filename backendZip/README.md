# CRM Lead Enrichment Backend

This project provides a Node.js + Express backend for lead search, enrichment, and email validation using Prospeo and Hunter behind a single API layer.

## Installation

```bash
npm install
cp .env.example .env
```

## Environment variables

Create a `.env` file with values like:

```env
PROSPEO_API_KEY=
HUNTER_API_KEY=
PORT=5000
```

## Obtain API keys

### Prospeo

1. Sign up or log in to the Prospeo dashboard.
2. Navigate to API settings or developer access.
3. Copy the API key and save it in `.env`.
4. Keep the key server-side only.

### Hunter

1. Sign up for a Hunter account.
2. Open the API dashboard.
3. Generate a new API key and save it to `.env`.
4. Do not expose it in frontend code or commit it to Git.

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
- `PATCH /api/leads/:id/status`

## Example requests

### Search leads

```bash
curl -X POST http://localhost:5000/api/leads/search \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "prospeo",
    "filters": { "job_title": "CEO" },
    "page": 1
  }'
```

### Enrich person

```bash
curl -X POST http://localhost:5000/api/leads/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "prospeo",
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

## Prospeo free-plan notes

Prospeo is treated as a provider-specific service with a dedicated client. For free-plan access, check the service's current public documentation before relying on a given endpoint or feature.

## Hunter free-plan notes

Hunter's public docs provide free access to some capabilities and usage limits vary by plan. The implementation matches the official API contract and returns clear errors when a capability is unavailable.
