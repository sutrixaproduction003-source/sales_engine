import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, appPassword, safeEqual, sessionToken } from "@/lib/auth";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; until: number }>();

/** POST /api/auth/login { password } — sign in with APP_PASSWORD. */
export async function POST(request: Request) {
  const password = appPassword();
  if (!password) return NextResponse.json({ ok: true });

  // Slow down guessing: 10 wrong tries → a 10-minute pause per client.
  const client = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const record = attempts.get(client);
  if (record && record.count >= 10 && record.until > Date.now()) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (!safeEqual(String(body.password ?? ""), password)) {
    const count = (record && record.until > Date.now() ? record.count : 0) + 1;
    attempts.set(client, { count, until: Date.now() + 10 * 60_000 });
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
