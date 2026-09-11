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
    "prospeo": { "configured": true },
    "hunter": { "configured": true },
    "apollo": { "configured": true }
  }
}
```

## Search leads

### POST /leads/search

Request body:

```json
{
  "provider": "prospeo",
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
  "provider": "prospeo",
  "firstName": "John",
  "lastName": "Doe",
  "companyWebsite": "example.com"
}
```

## Email finder

### POST /leads/email-finder

Request body:

```json
{
  "provider": "hunter",
  "firstName": "John",
  "lastName": "Doe",
  "domain": "example.com"
}
```

## Email verification

### POST /leads/email-verify

Request body:

```json
{
  "provider": "hunter",
  "email": "john@example.com"
}
```

## Company search

### POST /companies/search

Request body:

```json
{
  "provider": "prospeo",
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
