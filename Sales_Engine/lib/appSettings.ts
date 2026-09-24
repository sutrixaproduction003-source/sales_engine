/**
 * App settings stored in .env.local (edited from the Settings page).
 * Server-side only.
 *
 * Values are read from the file on every call, so a change saved in Settings
 * takes effect immediately — process.env only reflects the file as it was
 * when the server started. process.env is the fallback (e.g. for values set
 * by the hosting platform).
 */

import fs from "fs";
import path from "path";

const ENV_PATH = path.join(process.cwd(), ".env.local");

/** Settings the Settings page can edit. */
export const SETTING_KEYS = [
  "APIFY_TOKEN",
  "APOLLO_API_KEY",
  "GROQ_API_KEY",
  "DEEPSEEK_API_KEY",
  "HUBSPOT_ACCESS_TOKEN",
  "HUBSPOT_AUTO_SYNC",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "SENDER_NAME",
  "SENDER_COMPANY",
  "SENDER_PITCH",
  "LEAD_STORE",
  "GOOGLE_SHEET_ID",
  /** Service account key JSON, base64-encoded. */
  "GOOGLE_SERVICE_ACCOUNT",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** Settings shown back in full (not secrets). */
export const PLAIN_SETTINGS: SettingKey[] = [
  "GMAIL_USER",
  "SENDER_NAME",
  "SENDER_COMPANY",
  "SENDER_PITCH",
  "LEAD_STORE",
  "GOOGLE_SHEET_ID",
  "HUBSPOT_AUTO_SYNC",
];

const unquote = (value: string) =>
  value
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/\\n/g, "\n")
    .trim();

const quote = (value: string) => `"${value.replace(/\r?\n/g, "\\n").replace(/"/g, "'")}"`;

function readFileEntries(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = unquote(m[2]);
    }
  } catch {
    // Unreadable file: behave as if empty.
  }
  return out;
}

/** Current value of a setting ("" when unset). */
export function getSetting(key: string): string {
  const fromFile = readFileEntries()[key];
  return (fromFile || process.env[key] || "").trim();
}

export function getSettings(): Record<SettingKey, string> {
  const file = readFileEntries();
  return Object.fromEntries(
    SETTING_KEYS.map((key) => [key, (file[key] || process.env[key] || "").trim()])
  ) as Record<SettingKey, string>;
}

/**
 * Update settings in .env.local. Empty values are ignored (a blank field in
 * the form means "keep the current value"); other lines are preserved.
 */
export function saveSettings(updates: Partial<Record<SettingKey, string>>): void {
  const changes = Object.entries(updates).filter(([, value]) => typeof value === "string" && value.trim());
  if (changes.length === 0) return;

  const raw = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const lines = raw.split(/\r?\n/).filter((line, i, all) => line || i < all.length - 1);
  const pending = new Map(changes.map(([key, value]) => [key, (value as string).trim()]));

  const next = lines.map((line) => {
    const key = line.match(/^([A-Z0-9_]+)\s*=/)?.[1];
    if (key && pending.has(key)) {
      const value = pending.get(key) as string;
      pending.delete(key);
      return `${key}=${quote(value)}`;
    }
    return line;
  });
  pending.forEach((value, key) => next.push(`${key}=${quote(value)}`));

  fs.writeFileSync(ENV_PATH, `${next.join("\n")}\n`);
}

export function maskSecret(value: string): string {
  if (!value) return "";
  return value.length <= 6 ? "•".repeat(value.length) : `${value.slice(0, 3)}••••${value.slice(-2)}`;
}
