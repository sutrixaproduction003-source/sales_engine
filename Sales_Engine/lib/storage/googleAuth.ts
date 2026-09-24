/**
 * Google service-account access tokens (OAuth 2.0 JWT bearer flow), signed
 * with Node's crypto — no Google SDK needed. Server-side only.
 */

import { createSign } from "crypto";
import { getSetting } from "@/lib/appSettings";
import { LeadStoreError } from "./types";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/**
 * The service account key from Settings (stored base64-encoded so the JSON
 * survives .env quoting), or set by the host as GOOGLE_SERVICE_ACCOUNT (the
 * key file's JSON as-is, or base64) or GOOGLE_SERVICE_ACCOUNT_JSON.
 */
export function getServiceAccount(): ServiceAccount | null {
  const setting = getSetting("GOOGLE_SERVICE_ACCOUNT").trim();
  const raw = setting
    ? setting.startsWith("{")
      ? setting
      : Buffer.from(setting, "base64").toString("utf8")
    : process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "";
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

const base64url = (input: string | Buffer) =>
  Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

const cache = globalThis as unknown as { __googleToken?: { email: string; token: string; expires: number } };

export async function getAccessToken(): Promise<string> {
  const account = getServiceAccount();
  if (!account) {
    throw new LeadStoreError("Google Sheets is not set up: add a service account key in Settings.", "config");
  }

  const cached = cache.__googleToken;
  if (cached && cached.email === account.client_email && cached.expires > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  let signature: string;
  try {
    signature = base64url(createSign("RSA-SHA256").update(`${header}.${claims}`).sign(account.private_key));
  } catch {
    throw new LeadStoreError("The Google service account key is invalid (could not read its private key).", "config");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw new LeadStoreError(`Google rejected the service account: ${body.error_description ?? response.status}`, "config");
  }

  cache.__googleToken = {
    email: account.client_email,
    token: body.access_token,
    expires: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return body.access_token;
}
