import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const ENV_PATH = path.join(process.cwd(), ".env.local");

const KEYS = ["APIFY_TOKEN", "GROQ_API_KEY", "DEEPSEEK_API_KEY", "INSTANTLY_API_KEY", "HUBSPOT_ACCESS_TOKEN"];

function unquote(value: string): string {
  return value.trim().replace(/^"+|"+$/g, "").trim();
}

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && KEYS.includes(m[1])) {
        const parsed = unquote(m[2]);
        if (parsed) out[m[1]] = parsed;
      }
    }
  } catch { /* ignore */ }
  return out;
}

function mask(value: string): string {
  if (!value) return "";
  return value.length <= 6 ? "•".repeat(value.length) : value.slice(0,3) + "••••" + value.slice(-2);
}

export async function GET() {
  const env = readEnv();
  return NextResponse.json({
    configured: {
      apify: Boolean(env.APIFY_TOKEN),
      groq: Boolean(env.GROQ_API_KEY),
      deepseek: Boolean(env.DEEPSEEK_API_KEY),
      instantly: Boolean(env.INSTANTLY_API_KEY),
      hubspot: Boolean(env.HUBSPOT_ACCESS_TOKEN),
    },
    masked: {
      apify: mask(env.APIFY_TOKEN ?? ""),
      groq: mask(env.GROQ_API_KEY ?? ""),
      deepseek: mask(env.DEEPSEEK_API_KEY ?? ""),
      instantly: mask(env.INSTANTLY_API_KEY ?? ""),
      hubspot: mask(env.HUBSPOT_ACCESS_TOKEN ?? ""),
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, string>;
    const updates: Record<string, string> = {};
    if (body.apifyToken) updates.APIFY_TOKEN = body.apifyToken.trim();
    if (body.groqKey) updates.GROQ_API_KEY = body.groqKey.trim();
    if (body.deepseekKey) updates.DEEPSEEK_API_KEY = body.deepseekKey.trim();
    if (body.instantlyKey) updates.INSTANTLY_API_KEY = body.instantlyKey.trim();
    if (body.hubspotToken) updates.HUBSPOT_ACCESS_TOKEN = body.hubspotToken.trim();

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No keys provided" }, { status:  400 });
    }

    const existing = readEnv();
    const output: string[] = [];
    const seen = new Set<string>();

    for (const key of KEYS) {
      const value = updates[key] ?? existing[key] ?? "";
      if (value) {
        output.push(`${key}="${value}"`);
        seen.add(key);
      }
    }

    // Preserve non-managed vars (e.g., DATABASE_URL, OMNIROUTE_MODEL)
    if (fs.existsSync(ENV_PATH)) {
      const raw = fs.readFileSync(ENV_PATH, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const keyMatch = line.match(/^([A-Z0-9_]+)\s*=/);
        if (!keyMatch || KEYS.includes(keyMatch[1])) continue;
        output.push(line);
        seen.add(keyMatch[1]);
      }
    }

    fs.writeFileSync(ENV_PATH, output.join("\n") + "\n");

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save settings" },
      { status:  500 }
    );
  }
}