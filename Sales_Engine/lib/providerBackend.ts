/**
 * Base URL of the existing provider backend (backendZip Express server, which
 * fronts Prospeo/Hunter/Apollo). Server-side only — provider API keys live in that
 * backend's .env and are never exposed to the browser.
 */
export const PROVIDER_BACKEND_URL = (process.env.LEAD_BACKEND_URL ?? "http://localhost:5000").replace(/\/$/, "");