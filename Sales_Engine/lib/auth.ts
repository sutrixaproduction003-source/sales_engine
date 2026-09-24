/**
 * App sign-in: one shared password (APP_PASSWORD). Works in the Edge
 * middleware and in Node route handlers (Web Crypto only).
 *
 * The session cookie holds an HMAC of a fixed label keyed by the password, so
 * changing APP_PASSWORD signs everyone out.
 */

export const SESSION_COOKIE = "se_session";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export const appPassword = () => process.env.APP_PASSWORD?.trim() || "";

/** Deployed on Vercel without a password: the app must not run open. */
export const passwordRequiredButMissing = () => !appPassword() && process.env.VERCEL === "1";

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sessionToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("sales-engine-session-v1")));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookie: string | undefined): Promise<boolean> {
  const password = appPassword();
  if (!password) return true;
  return Boolean(cookie) && safeEqual(cookie as string, await sessionToken(password));
}
