"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, ExternalLink, KeyRound, Mail, Send, UserRound } from "lucide-react";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { apiCall } from "@/lib/api";
import { HubSpotSettings } from "@/components/settings/HubSpotSettings";
import { StorageSettings } from "@/components/settings/StorageSettings";

type Key =
  | "GMAIL_USER"
  | "GMAIL_APP_PASSWORD"
  | "SENDER_NAME"
  | "SENDER_COMPANY"
  | "SENDER_PITCH"
  | "DEEPSEEK_API_KEY"
  | "GROQ_API_KEY"
  | "APIFY_TOKEN"
  | "APOLLO_API_KEY";

type SettingsData = { values: Record<Key, string>; configured: Record<Key, boolean> };

const API_KEYS: { key: Key; label: string; hint: string }[] = [
  {
    key: "APOLLO_API_KEY",
    label: "Apollo.io",
    hint: "Finds decision-makers at a business and their work emails (Discovery, Find missing emails). 1 credit per email found",
  },
  { key: "DEEPSEEK_API_KEY", label: "DeepSeek", hint: "AI email drafts (optional — a template is used without it)" },
  { key: "GROQ_API_KEY", label: "Groq", hint: "Alternative AI provider for drafts (optional)" },
  { key: "APIFY_TOKEN", label: "Apify", hint: "Reads websites that block simple requests (optional)" },
];

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <Card className="max-w-2xl space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300">{icon}</span>
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="text-sm text-slate-400">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [form, setForm] = useState<Partial<Record<Key, string>>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    apiCall<SettingsData>("/api/settings")
      .then((settings) => {
        setData(settings);
        // Plain (non-secret) fields are pre-filled so they can be edited.
        setForm({
          GMAIL_USER: settings.values.GMAIL_USER,
          SENDER_NAME: settings.values.SENDER_NAME,
          SENDER_COMPANY: settings.values.SENDER_COMPANY,
          SENDER_PITCH: settings.values.SENDER_PITCH,
        });
      })
      .catch(() => setData(null));
  }, []);

  useEffect(load, [load]);

  const set = (key: Key) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const configured = (key: Key) => Boolean(data?.configured?.[key]);

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await apiCall<{ ok: boolean }>("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: form }),
      });
      setMsg({ ok: true, text: "Saved — changes apply immediately." });
      load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const onTestGmail = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await apiCall<{ message: string }>("/api/mail", { method: "POST" });
      setTestMsg({ ok: true, text: res.message });
    } catch (err) {
      setTestMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  const gmailConnected = configured("GMAIL_USER") && configured("GMAIL_APP_PASSWORD");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-slate-400">
          Stored in .env.local on this machine. Secrets are never shown again after saving.
        </p>
      </div>

      <Section
        icon={<Mail className="h-4 w-4" />}
        title="Gmail (sending)"
        description="Approved emails are sent from this Gmail account through Gmail SMTP."
      >
        <div className="flex items-center gap-2 text-sm">
          {gmailConnected ? (
            <Badge color="emerald">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Connected as {data?.values.GMAIL_USER}
            </Badge>
          ) : (
            <Badge color="slate">Not connected</Badge>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Gmail address</Label>
            <Input type="email" placeholder="you@gmail.com" value={form.GMAIL_USER ?? ""} onChange={set("GMAIL_USER")} />
          </div>
          <div>
            <Label>App Password {configured("GMAIL_APP_PASSWORD") && <span className="text-emerald-400">· saved</span>}</Label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder={configured("GMAIL_APP_PASSWORD") ? data?.values.GMAIL_APP_PASSWORD : "16-character app password"}
              value={form.GMAIL_APP_PASSWORD ?? ""}
              onChange={set("GMAIL_APP_PASSWORD")}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Use a Google <strong className="text-slate-400">App Password</strong>, not your normal password: turn on 2-Step
          Verification, then create one at{" "}
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-sky-400 hover:underline"
          >
            myaccount.google.com/apppasswords <ExternalLink className="h-3 w-3" />
          </a>
          . Gmail allows about 500 emails a day.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={onTestGmail} loading={testing} disabled={!gmailConnected}>
            <Send className="h-4 w-4" /> Send test email to myself
          </Button>
          {testMsg && <span className={`text-sm ${testMsg.ok ? "text-emerald-400" : "text-rose-400"}`}>{testMsg.text}</span>}
        </div>
      </Section>

      <Section
        icon={<UserRound className="h-4 w-4" />}
        title="Sender profile"
        description="Used to personalize every draft and in the signature."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Your name</Label>
            <Input placeholder="e.g. Priya Sharma" value={form.SENDER_NAME ?? ""} onChange={set("SENDER_NAME")} />
          </div>
          <div>
            <Label>Company</Label>
            <Input placeholder="e.g. Rizstay" value={form.SENDER_COMPANY ?? ""} onChange={set("SENDER_COMPANY")} />
          </div>
        </div>
        <div>
          <Label>What you offer (1–2 sentences)</Label>
          <textarea
            rows={3}
            value={form.SENDER_PITCH ?? ""}
            onChange={set("SENDER_PITCH")}
            placeholder="e.g. Rizstay helps independent hotels increase direct bookings with a commission-free booking engine and channel manager."
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </Section>

      <StorageSettings />

      <HubSpotSettings />

      <Section icon={<KeyRound className="h-4 w-4" />} title="API keys" description="Optional integrations.">
        <div className="space-y-3">
          {API_KEYS.map(({ key, label, hint }) => (
            <div key={key}>
              <div className="flex items-center gap-2">
                <Label>{label}</Label>
                {configured(key) && <Badge color="emerald">Configured</Badge>}
              </div>
              <Input
                type="password"
                autoComplete="off"
                placeholder={configured(key) ? data?.values[key] : key}
                value={form[key] ?? ""}
                onChange={set(key)}
              />
              <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <Button onClick={onSave} loading={saving}>
          Save settings
        </Button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
