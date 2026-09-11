"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Label, Badge } from "@/components/ui";
import { apiCall } from "@/lib/api";
import { KeyRound } from "lucide-react";

type SettingsData = {
  configured: { apify: boolean; groq: boolean; deepseek: boolean; instantly: boolean; hubspot: boolean };
  masked: { apify: string; groq: string; deepseek: string; instantly: string; hubspot: string };
};

export default function SettingsPage() {
  const [apify, setApify] = useState("");
  const [groq, setGroq] = useState("");
  const [deepseek, setDeepseek] = useState("");
  const [instantly, setInstantly] = useState("");
  const [hubspot, setHubspot] = useState("");
  const [configured, setConfigured] = useState({ apify: false, groq: false, deepseek: false, instantly: false, hubspot: false });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiCall<SettingsData>("/api/settings")
      .then((data) => {
        setConfigured({
          apify: Boolean(data?.configured?.apify),
          groq: Boolean(data?.configured?.groq),
          deepseek: Boolean(data?.configured?.deepseek),
          instantly: Boolean(data?.configured?.instantly),
          hubspot: Boolean(data?.configured?.hubspot),
        });
      })
      .catch(() => {});
  }, []);

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await apiCall<{ ok: boolean }>("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apifyToken: apify,
          groqKey: groq,
          deepseekKey: deepseek,
          instantlyKey: instantly,
          hubspotToken: hubspot,
        }),
      });
      setMsg({ ok: true, text: "Settings saved to .env.local" });
      setApify("");
      setGroq("");
      setDeepseek("");
      setInstantly("");
      setHubspot("");
    } catch (err) {
      setMsg({ ok: false, text: (err instanceof Error ? err.message : String(err)) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-whit">Settings</h1>
        <p className="text-sm text-slate-400">API keys are stored in .env.local and used by the pipeline routes.</p>
      </div>

      <Card className="max-w-xl space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-400" />
            <Label>DeepSeek</Label>
            {configured?.deepseek && <Badge color="emerald">Configured</Badge>}
          </div>
          <Input type="password" placeholder="DEEPSEEK_API_KEY" value={deepseek} onChange={(e) => setDeepseek(e.target.value)} />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-400" />
            <Label>Apify</Label>
            {configured?.apify && <Badge color="emerald">Configured</Badge>}
          </div>
          <Input
            type="password"
            placeholder="APIFY_TOKEN"
            value={apify}
            onChange={(e) => setApify(e.target.value)}
          />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-400" />
            <Label>HubSpot CRM</Label>
            {configured?.hubspot && <Badge color="emerald">Configured</Badge>}
          </div>
          <Input
            type="password"
            placeholder="HUBSPOT_ACCESS_TOKEN"
            value={hubspot}
            onChange={(e) => setHubspot(e.target.value)}
          />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-400" />
            <Label>Groq</Label>
            {configured?.groq && <Badge color="emerald">Configured</Badge>}
          </div>
          <Input
            type="password"
            placeholder="GROQ_API_KEY"
            value={groq}
            onChange={(e) => setGroq(e.target.value)}
          />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-400" />
            <Label>Instantly.ai</Label>
            {configured?.instantly && <Badge color="emerald">Configured</Badge>}
          </div>
          <Input
            type="password"
            placeholder="INSTANTLY_API_KEY"
            value={instantly}
            onChange={(e) => setInstantly(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => onSave()} loading={saving}>Save Keys</Button>
          {msg && (
            <span className={"text-sm " + (msg.ok ? "text-emerald-400" : "text-rose-400")}>{msg.text}</span>
          )}
        </div>
      </Card>
    </div>
  );
}