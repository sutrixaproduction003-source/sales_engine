import { NextResponse } from "next/server";
import {
  PLAIN_SETTINGS,
  SETTING_KEYS,
  getSettings,
  maskSecret,
  saveSettings,
  type SettingKey,
} from "@/lib/appSettings";
import { getServiceAccount } from "@/lib/storage/googleAuth";
import { parseSheetId } from "@/lib/storage/sheetsStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings — which settings are set. Secrets are only ever returned
 * masked; plain settings (Gmail address, sender profile, storage) in full.
 */
export async function GET() {
  const settings = getSettings();
  const values = Object.fromEntries(
    SETTING_KEYS.map((key) => [key, PLAIN_SETTINGS.includes(key) ? settings[key] : maskSecret(settings[key])])
  );
  const configured = Object.fromEntries(SETTING_KEYS.map((key) => [key, Boolean(settings[key])]));

  return NextResponse.json({
    values,
    configured,
    // Safe to show: the address the Google Sheet must be shared with.
    serviceAccountEmail: getServiceAccount()?.client_email ?? null,
  });
}

/**
 * POST /api/settings — { values: { GMAIL_USER: "...", ... } }. Blank values
 * keep the current setting. Saved to .env.local; takes effect immediately.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { values?: Record<string, unknown> };
    const updates: Partial<Record<SettingKey, string>> = {};
    for (const key of SETTING_KEYS) {
      const value = body.values?.[key];
      if (typeof value === "string" && value.trim()) updates[key] = value;
    }

    if (updates.GMAIL_USER && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.GMAIL_USER.trim())) {
      return NextResponse.json({ error: "Enter a valid Gmail address." }, { status: 400 });
    }
    if (updates.LEAD_STORE && !["excel", "sheets"].includes(updates.LEAD_STORE)) {
      return NextResponse.json({ error: "Lead storage must be Excel or Google Sheets." }, { status: 400 });
    }
    if (updates.HUBSPOT_AUTO_SYNC && !["true", "false"].includes(updates.HUBSPOT_AUTO_SYNC)) {
      return NextResponse.json({ error: "Invalid HubSpot auto-sync value." }, { status: 400 });
    }
    if (updates.GOOGLE_SHEET_ID) updates.GOOGLE_SHEET_ID = parseSheetId(updates.GOOGLE_SHEET_ID);
    if (updates.GOOGLE_SERVICE_ACCOUNT) {
      // Pasted as the downloaded JSON key; stored base64 so it survives .env quoting.
      try {
        const key = JSON.parse(updates.GOOGLE_SERVICE_ACCOUNT) as { client_email?: string; private_key?: string };
        if (!key.client_email || !key.private_key) throw new Error("missing fields");
      } catch {
        return NextResponse.json(
          { error: "The service account key must be the JSON file downloaded from Google Cloud." },
          { status: 400 }
        );
      }
      updates.GOOGLE_SERVICE_ACCOUNT = Buffer.from(updates.GOOGLE_SERVICE_ACCOUNT.trim()).toString("base64");
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }

    saveSettings(updates);
    return NextResponse.json({ ok: true, saved: Object.keys(updates) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}
