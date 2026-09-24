/**
 * Base URL of the existing provider backend (backendZip Express server, which
 * fronts Prospeo/Hunter/Apollo and the Apify scrapers). Server-side only —
 * provider API keys live in that backend's .env and are never exposed to the
 * browser.
 */
export const PROVIDER_BACKEND_URL = (
  process.env.LEAD_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

/** POST a JSON body to the provider backend (never cached). */
export function postToBackend(path: string, body: unknown): Promise<Response> {
  return fetch(`${PROVIDER_BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}
