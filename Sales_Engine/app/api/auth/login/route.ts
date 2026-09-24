import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, appPassword, safeEqual, sessionToken } from "@/lib/auth";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; until: number }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The caller's address. On Vercel, x-real-ip is set by Vercel's edge and can't
 * be forged by the client (unlike the first x-forwarded-for entry).
 */
function clientAddress(request: Request) {
  if (process.env.VERCEL === "1") return request.headers.get("x-real-ip") || "unknown";
  return request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
}

/** POST /api/auth/login { password } — sign in with APP_PASSWORD. */
export async function POST(request: Request) {
  const password = appPassword();
  if (!password) return NextResponse.json({ ok: true });

  // Slow down guessing: every wrong try waits a second, and 10 wrong tries
  // pause that address for 10 minutes. This is per server instance, so the
  // real protection is the password's length (at least 12 characters when
  // deployed — see passwordRequiredButMissing).
  const client = clientAddress(request);
  const record = attempts.get(client);
  if (record && record.count >= 10 && record.until > Date.now()) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (!safeEqual(String(body.password ?? ""), password)) {
    const count = (record && record.until > Date.now() ? record.count : 0) + 1;
    attempts.set(client, { count, until: Date.now() + 10 * 60_000 });
    await sleep(1000);
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  attempts.delete(client);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
