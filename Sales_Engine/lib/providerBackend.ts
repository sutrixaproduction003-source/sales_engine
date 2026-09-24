import { NextResponse } from "next/server";
import { getSetting } from "@/lib/appSettings";

/**
 * Base URL of the existing provider backend (backendZip Express server, which
 * fronts Apollo and the Apify scrapers). Server-side only — provider API
 * keys live in that backend's .env, or in Settings (the Apollo key is
 * forwarded per request); they are never exposed to the browser.
 */
export const PROVIDER_BACKEND_URL = (
  process.env.LEAD_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

/** Keys saved on the Settings page, forwarded to the backend. */
export function backendHeaders(): Record<string, string> {
  const apolloKey = getSetting("APOLLO_API_KEY");
  return apolloKey ? { "x-apollo-api-key": apolloKey } : {};
}

/** GET from the provider backend (never cached). */
export function getFromBackend(path: string): Promise<Response> {
  return fetch(`${PROVIDER_BACKEND_URL}${path}`, { headers: backendHeaders(), cache: "no-store" });
}

/** POST a JSON body to the provider backend (never cached). */
export function postToBackend(path: string, body: unknown): Promise<Response> {
  return fetch(`${PROVIDER_BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...backendHeaders() },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

const UNREACHABLE = "Provider backend is unreachable. Start the CRM backend (backendZip) and try again.";

/**
 * Call the provider backend and unwrap its `{ success, error: { message } }`
 * envelope. Returns the parsed body on success, or a NextResponse to return
 * as-is on failure.
 */
export async function callBackend<T>(request: () => Promise<Response>): Promise<T | NextResponse> {
  let response: Response;
  try {
    response = await request();
  } catch {
    return NextResponse.json({ error: UNREACHABLE }, { status: 502 });
  }

  const body = (await response.json().catch(() => null)) as
    | (T & { success?: boolean; error?: { message?: string } })
    | null;

  if (!response.ok || !body?.success) {
    return NextResponse.json(
      { error: body?.error?.message ?? `Provider backend responded with ${response.status}.` },
      { status: response.status >= 400 ? response.status : 502 }
    );
  }
  return body;
}
