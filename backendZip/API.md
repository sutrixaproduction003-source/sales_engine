# API Reference

## Base URL

`http://localhost:5000/api`

## Health check

### GET /crm/health

Returns provider configuration status.

Example response:

```json
{
  "success": true,
  "providers": {
    "apollo": { "configured": true }
  }
}
```

## Search leads

### POST /leads/search

Request body:

```json
{
  "provider": "apollo",
  "filters": {
    "job_title": "CEO",
    "location": "United States",
    "industry": "Software"
  },
  "page": 1
}
```

## Enrich lead

### POST /leads/enrich

Request body:

```json
{
  "provider": "apollo",
  "firstName": "John",
  "lastName": "Doe",
  "companyWebsite": "example.com"
}
```

## Email finder (stub)

No configured provider supports this yet; requests return `400 PROVIDER_CAPABILITY_UNSUPPORTED`.

### POST /leads/email-finder

Request body:

```json
{
  "provider": "apollo",
  "firstName": "John",
  "lastName": "Doe",
  "domain": "example.com"
}
```

## Email verification (stub)

No configured provider supports this yet; requests return `400 PROVIDER_CAPABILITY_UNSUPPORTED`.

### POST /leads/email-verify

Request body:

```json
{
  "provider": "apollo",
  "email": "john@example.com"
}
```

## Company search

### POST /companies/search

Request body:

```json
{
  "provider": "apollo",
  "filters": {
    "industry": "Software",
    "location": "United States"
  },
  "page": 1
}
```

## Lead status update

### PATCH /leads/:id/status

Request body:

```json
{
  "status": "QUALIFIED"
}
```

Accepted statuses:

- NEW
- ENRICHED
- VERIFIED
- CONTACTED
- QUALIFIED
- CONVERTED

The status update is persisted for the lead with the given `id` (leads are
stored when they are returned by search/enrich). Responses:

- `200` — `{ "success": true, "data": { "id", "status", "lead" } }`
- `400` — invalid status or missing id
- `404` — no lead with the given id (code `LEAD_NOT_FOUND`)
