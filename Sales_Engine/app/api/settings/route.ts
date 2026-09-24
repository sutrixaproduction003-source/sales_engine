import { NextResponse } from "next/server";
import {
  PLAIN_SETTINGS,
  SETTING_KEYS,
  getSettings,
  maskSecret,
  saveSettings,
  type SettingKey,
} from "@/lib/appSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings — which settings are set. Secrets are only ever returned
 * masked; plain settings (Gmail address, sender profile) in full.
 */
export async function GET() {
  const settings = getSettings();
  const values = Object.fromEntries(
    SETTING_KEYS.map((key) => [key, PLAIN_SETTINGS.includes(key) ? settings[key] : maskSecret(settings[key])])
  );
  const configured = Object.fromEntries(SETTING_KEYS.map((key) => [key, Boolean(settings[key])]));

  return NextResponse.json({ values, configured });
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
