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
  const result = readServiceAccount();
  return "account" in result ? result.account : null;
}

/** Why the configured key can't be used, in words safe to show (never any key content). */
export function serviceAccountProblem(): string | null {
  const result = readServiceAccount();
  return "problem" in result ? result.problem : null;
}

/** Remove quotes a host's settings form may have kept around the whole value. */
const unwrap = (value: string) => value.trim().replace(/^(['"])([\s\S]*)\1$/, "$2").trim();

type KeyResult = { account: ServiceAccount } | { problem: string } | { missing: true };

/**
 * Read the key leniently: pasted into a hosting dashboard, the JSON often
 * arrives wrapped in quotes, base64-encoded, or with the private key's "\n"
 * turned into real line breaks (which JSON.parse rejects) — all accepted.
 */
function readServiceAccount(): KeyResult {
  const setting = unwrap(getSetting("GOOGLE_SERVICE_ACCOUNT"));
  let raw = setting || unwrap(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "");
  if (!raw) return { missing: true };
  if (!raw.startsWith("{")) {
    const decoded = Buffer.from(raw, "base64").toString("utf8").trim();
    if (!decoded.startsWith("{")) {
      return { problem: "GOOGLE_SERVICE_ACCOUNT isn't the key file's JSON (it should start with { ) or its base64." };
    }
    raw = decoded;
  }

  let parsed: Partial<ServiceAccount> & { type?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Real line breaks inside the private key: pick the two fields out directly.
    const email = raw.match(/"client_email"\s*:\s*"([^"]+)"/)?.[1];
    const key = raw.match(/"private_key"\s*:\s*"(-----BEGIN [^"]+-----END [A-Z ]+-----[^"]*)"/)?.[1];
    if (!email || !key) {
      return {
        problem:
          "GOOGLE_SERVICE_ACCOUNT couldn't be read as JSON. Paste the whole key file, from the first { to the last }, with nothing around it.",
      };
    }
    parsed = { client_email: email, private_key: key };
  }

  if (!parsed.client_email) return { problem: "GOOGLE_SERVICE_ACCOUNT has no client_email — is it a service account key file?" };
  if (!parsed.private_key) return { problem: "GOOGLE_SERVICE_ACCOUNT has no private_key — download a new JSON key for the service account." };
  // "\n" written out as text → real line breaks, as the PEM format needs.
  const privateKey = parsed.private_key.replace(/\\n/g, "\n");
  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(privateKey)) {
    return { problem: "GOOGLE_SERVICE_ACCOUNT's private_key looks cut off. Paste the whole key file again." };
  }
  return { account: { client_email: parsed.client_email, private_key: privateKey } };
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
