import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, appPassword, isValidSession, passwordRequiredButMissing } from "@/lib/auth";

const SETUP_MESSAGE = "Set APP_PASSWORD in the Vercel project's environment variables, then redeploy.";

const SETUP_PAGE = `<!doctype html><title>Sales Engine</title>
<body style="font-family:system-ui;background:#020617;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:28rem;padding:1.5rem"><h1 style="font-size:1.1rem">Sign-in is not set up</h1>
<p style="color:#94a3b8">${SETUP_MESSAGE}</p></div></body>`;

/**
 * Every page and API route needs a sign-in when APP_PASSWORD is set — the
 * API spends paid credits (Apify, Apollo) and sends email. Locally without a
 * password the app stays open; deployed on Vercel it refuses to run open.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const isAuthRoute = pathname === "/login" || pathname.startsWith("/api/auth/");

  if (passwordRequiredButMissing()) {
    if (isApi) return NextResponse.json({ error: SETUP_MESSAGE }, { status: 503 });
    return new NextResponse(SETUP_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  if (!appPassword() || isAuthRoute) return NextResponse.next();
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's static assets and public files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|csv|json|woff2?)$).*)"],
};
