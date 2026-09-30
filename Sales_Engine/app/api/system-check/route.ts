import { NextResponse } from "next/server";
import { appPassword, MIN_DEPLOYED_PASSWORD_LENGTH } from "@/lib/auth";
import { checkAiProviders } from "@/lib/emailDraft";
import { hubspotConfigured, hubspotHealth } from "@/lib/hubspot";
import { activeStore, countLeads, storageStatus } from "@/lib/leadDb";
import { getMailConfig, verifyMailConnection } from "@/lib/mailer";
import { callBackend, getFromBackend } from "@/lib/providerBackend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type CheckStatus = "ok" | "fail" | "not_configured" | "warn";
export interface SystemCheck {
  id: string;
  name: string;
  status: CheckStatus;
  detail: string;
  /** Where to fix it. */
  fix?: string;
}

const TIMEOUT_MS = 25000;

/** Run one check with a time limit; errors become a "fail" result. */
async function run(id: string, name: string, fn: () => Promise<Omit<SystemCheck, "id" | "name">>, fix?: string): Promise<SystemCheck> {
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("No answer within 25 seconds.")), TIMEOUT_MS)),
    ]);
    return { id, name, fix, ...result };
  } catch (error) {
    return { id, name, fix, status: "fail", detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * GET /api/system-check — live checks of every connected service with the
 * configured credentials. Nothing is sent, written or charged:
 *  - Gmail: SMTP sign-in only · HubSpot: one read · Google Sheets: read the
 *    lead tab · AI: a few-token prompt · Apify: account lookup · Apollo: a
 *    one-result search (free).
 */
export async function GET() {
  const onVercel = process.env.VERCEL === "1";

  const checks = await Promise.all([
    run("signin", "Sign-in", async () => {
      const length = appPassword().length;
      if (!length) return { status: onVercel ? "fail" : "warn", detail: onVercel ? "APP_PASSWORD is not set." : "No password: the app is open (fine on your own computer)." };
      if (length < MIN_DEPLOYED_PASSWORD_LENGTH) return { status: "warn", detail: `APP_PASSWORD is shorter than ${MIN_DEPLOYED_PASSWORD_LENGTH} characters.` };
      return { status: "ok", detail: "Password protection is on." };
    }, "Vercel → Settings → Environment Variables → APP_PASSWORD"),

    run("storage", "Lead storage", async () => {
      const status = storageStatus();
      if (!status.connected) return { status: "fail", detail: status.message ?? "Not connected." };
      const store = activeStore();
      const count = await countLeads(store.id);
      return { status: "ok", detail: `${store.label}: read ${count.toLocaleString()} leads.` };
    }, "Share the Google Sheet with the service account as Editor; set GOOGLE_SHEET_ID and GOOGLE_SERVICE_ACCOUNT"),

    run("gmail", "Gmail (sending)", async () => {
      const mail = getMailConfig();
      if (!mail.configured) return { status: "not_configured", detail: "No Gmail address / App Password set." };
      await verifyMailConnection();
      return { status: "ok", detail: `Signed in to Gmail as ${mail.user} (nothing sent).` };
    }, "Settings → Gmail, or GMAIL_USER + GMAIL_APP_PASSWORD on Vercel"),

    run("ai", "AI drafting", async () => {
      const results = await checkAiProviders();
      if (!results.length) return { status: "not_configured", detail: "No AI key: drafts use the template." };
      const good = results.filter((r) => r.ok);
      return {
        status: good.length ? (good.length === results.length ? "ok" : "warn") : "fail",
        detail: results.map((r) => `${r.name}: ${r.ok ? "working" : r.detail}`).join(" · "),
      };
    }, "DEEPSEEK_API_KEY or GROQ_API_KEY"),

    run("hubspot", "HubSpot CRM", async () => {
      if (!hubspotConfigured()) return { status: "not_configured", detail: "No HubSpot token set." };
      await hubspotHealth();
      return { status: "ok", detail: "Token accepted; contacts are readable." };
    }, "Settings → HubSpot, or HUBSPOT_ACCESS_TOKEN on Vercel"),

    run("backend", "Backend", async () => {
      const res = await callBackend<{ providers?: unknown }>(() => getFromBackend("/api/crm/health"));
      if (res instanceof NextResponse) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return { status: "fail", detail: body.error ?? "Not reachable." };
      }
      return { status: "ok", detail: "Reachable and accepting the app's requests." };
    }, "LEAD_BACKEND_URL (and the same BACKEND_API_KEY on both sides)"),
  ]);

  // Apify and Apollo are checked by the backend (it holds those clients).
  const live = await callBackend<{ apify: { status: CheckStatus; detail: string }; apollo: { status: CheckStatus; detail: string } }>(
    () => getFromBackend("/api/health/live")
  );
  if (live instanceof NextResponse) {
    const detail = "Couldn't ask the backend (see Backend).";
    checks.push({ id: "apify", name: "Apify (Google Maps)", status: "fail", detail });
    checks.push({ id: "apollo", name: "Apollo.io", status: "fail", detail });
  } else {
    checks.push({ id: "apify", name: "Apify (Google Maps)", ...live.apify, fix: "APIFY_TOKEN on the backend" });
    checks.push({ id: "apollo", name: "Apollo.io", ...live.apollo, fix: "Settings → API keys → Apollo.io" });
  }

  return NextResponse.json({ checkedAt: new Date().toISOString(), checks });
}
