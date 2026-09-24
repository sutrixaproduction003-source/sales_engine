"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, RefreshCw, Workflow, XCircle } from "lucide-react";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { apiCall } from "@/lib/api";
import { getHubSpotStatus, syncToHubSpot, type HubSpotStatus } from "@/lib/hubspotClient";

type Msg = { ok: boolean; text: string } | null;

const saveSettings = (values: Record<string, string>) =>
  apiCall("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });

/** Settings → HubSpot CRM: token, auto-sync, test, and a full sync. */
export function HubSpotSettings() {
  const [status, setStatus] = useState<HubSpotStatus | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(() => {
    setStatus(null);
    getHubSpotStatus()
      .then(setStatus)
      .catch(() => setStatus({ configured: false, connected: false, autoSync: false }));
  }, []);
  useEffect(load, [load]);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
      load();
    }
  };

  const saveToken = () =>
    run("token", async () => {
      await saveSettings({ HUBSPOT_ACCESS_TOKEN: tokenInput.trim(), HUBSPOT_AUTO_SYNC: "true" });
      setTokenInput("");
      return "Token saved and auto-sync turned on.";
    });

  const toggleAutoSync = () =>
    run("auto", async () => {
      const next = status?.autoSync ? "false" : "true";
      await saveSettings({ HUBSPOT_AUTO_SYNC: next });
      return next === "true" ? "Auto-sync on: new and updated leads go to HubSpot." : "Auto-sync off.";
    });

  const syncAll = () =>
    run("sync", async () => {
      const result = await syncToHubSpot(undefined, (done, remaining) => setMsg({ ok: true, text: `Syncing… ${done}/${done + remaining}` }));
      return `Synced ${result.synced} leads to HubSpot${result.failed ? ` · ${result.failed} failed — ${result.errors[0]}` : ""}.`;
    });

  return (
    <Card className="max-w-2xl space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-400">
          <Workflow className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-white">HubSpot CRM</h2>
          <p className="text-sm text-slate-400">
            Leads become HubSpot contacts linked to their company; pipeline status maps to Lead Status and sent emails
            are logged on the contact.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {status === null ? (
          <Badge color="slate">Checking…</Badge>
        ) : status.connected ? (
          <Badge color="emerald">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
          </Badge>
        ) : status.configured ? (
          <Badge color="amber">
            <XCircle className="mr-1 h-3 w-3" /> Token saved, but HubSpot rejected it
          </Badge>
        ) : (
          <Badge color="slate">Not connected</Badge>
        )}
        {status?.error && <span className="text-xs text-rose-300">{status.error}</span>}
      </div>

      <div>
        <Label>Private app access token</Label>
        <div className="flex gap-2">
          <Input
            type="password"
            autoComplete="off"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={status?.configured ? "Saved — paste a new token to replace it" : "pat-na1-…"}
          />
          <Button onClick={saveToken} loading={busy === "token"} disabled={busy !== null || !tokenInput.trim()}>
            Save
          </Button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          In HubSpot: Settings → Integrations →{" "}
          <a
            href="https://app.hubspot.com/private-apps/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-sky-400 hover:underline"
          >
            Private Apps <ExternalLink className="h-3 w-3" />
          </a>{" "}
          → Create a private app with scopes <code className="text-slate-400">crm.objects.contacts.read/write</code> and{" "}
          <code className="text-slate-400">crm.objects.companies.read/write</code> (optional:{" "}
          <code className="text-slate-400">crm.schemas.contacts.write</code>,{" "}
          <code className="text-slate-400">crm.schemas.companies.write</code> for extra fields), then copy its token.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={Boolean(status?.autoSync)}
            onChange={toggleAutoSync}
            disabled={!status?.configured || busy !== null}
          />
          Auto-sync — every imported, scraped or saved lead goes straight into HubSpot
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={syncAll} loading={busy === "sync"} disabled={!status?.connected || busy !== null}>
          <RefreshCw className="h-4 w-4" /> Sync all new &amp; changed leads now
        </Button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</span>}
      </div>
    </Card>
  );
}
