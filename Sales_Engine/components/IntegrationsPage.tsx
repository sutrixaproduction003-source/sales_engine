"use client";

import { useEffect, useState } from "react";
import { Plug, ShieldCheck, Puzzle, CheckCircle2, XCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { Card, Badge, Button, cn } from "@/components/ui";
import { getProviderHealth } from "@/lib/leadService";
import { apiCall } from "@/lib/api";

/**
 * Integrations — provider status is REAL backend data:
 *  - Apollo → GET /api/providers/health (proxies the provider
 *    backend's GET /api/crm/health — configured flags only, never keys)
 *  - Apify / AI / Gmail → GET /api/settings (configured flags only)
 *  - LinkedIn Sales Navigator → link-based (opens in the user's own seat), no status
 * The frontend holds no provider credentials and performs no provider calls.
 */

type HealthState = { configured: boolean } | null;

function StatusBadge({ state, backendError }: { state: HealthState; backendError: boolean }) {
  if (backendError) return <Badge color="amber">Status unknown — provider backend unreachable</Badge>;
  if (state === null) return <Badge color="slate">Checking…</Badge>;
  return state.configured ? (
    <Badge color="emerald">
      <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
    </Badge>
  ) : (
    <Badge color="slate">
      <XCircle className="mr-1 h-3 w-3" /> Not configured
    </Badge>
  );
}

function PipelineStatusBadge({ configured }: { configured: boolean | null }) {
  if (configured === null) return <Badge color="slate">Checking…</Badge>;
  return configured ? (
    <Badge color="emerald">
      <CheckCircle2 className="mr-1 h-3 w-3" /> Configured
    </Badge>
  ) : (
    <Badge color="slate">
      <XCircle className="mr-1 h-3 w-3" /> Not configured
    </Badge>
  );
}

export function IntegrationsPageContent() {
  const [health, setHealth] = useState<Record<string, HealthState> | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<Record<string, boolean> | null>(null);
  const [hubspot, setHubspot] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    getProviderHealth()
      .then((data) => {
        setHealth(data.providers ?? {});
        setHealthError(null);
      })
      .catch((err: unknown) =>
        setHealthError(err instanceof Error ? err.message : "Provider backend unreachable.")
      );
    apiCall<{ configured: Record<string, boolean> }>("/api/settings")
      .then((data) => setPipeline(data.configured))
      .catch(() => setPipeline(null));
    apiCall<{ configured: boolean; connected: boolean }>("/api/hubspot/health")
      .then(setHubspot)
      .catch(() => setHubspot({ configured: false, connected: false }));
  }, []);

  const backendError = healthError !== null;

  const syncHubSpot = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await apiCall<{ synced: number; attempted: number; errors: string[] }>("/api/hubspot/sync", { method: "POST" });
      setSyncMessage(`${result.synced}/${result.attempted} leads synced${result.errors.length ? `; ${result.errors.length} failed` : ""}.`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "HubSpot sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const providers: { name: string; initial: string; tone: string; desc: string; state: HealthState }[] = [
    {
      name: "Apollo.io",
      initial: "A",
      tone: "from-amber-500 to-orange-600",
      desc: "Decision-makers at a business and their work emails. Add the API key in Settings → API keys.",
      state: health?.apollo ?? null,
    },
  ];

  const pipelineServices: { name: string; envVar: string; configured: boolean | null }[] = [
    {
      name: "Gmail SMTP (sending)",
      envVar: "GMAIL_USER + GMAIL_APP_PASSWORD",
      configured: pipeline ? Boolean(pipeline.GMAIL_USER && pipeline.GMAIL_APP_PASSWORD) : null,
    },
    {
      name: "AI drafting",
      envVar: "DEEPSEEK_API_KEY or GROQ_API_KEY",
      configured: pipeline ? Boolean(pipeline.DEEPSEEK_API_KEY || pipeline.GROQ_API_KEY) : null,
    },
    { name: "Apify", envVar: "APIFY_TOKEN", configured: pipeline?.APIFY_TOKEN ?? null },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
          <Plug className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white">Integrations</h1>
          <p className="text-sm text-slate-400">
            Connect data providers through the Sales Engine backend — credentials never touch the browser.
          </p>
        </div>
      </div>

      {/* Architecture note */}
      <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <p className="text-sm text-slate-400">
          All provider connections run through the backend API. The frontend only shows connection status —
          no API keys or secrets are stored or sent from this page.
        </p>
      </div>

      {/* Provider backend error */}
      {backendError && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-300">
            {healthError} — start the CRM provider backend (backendZip) to see live Apollo status.
          </p>
        </div>
      )}

      {/* API provider cards — status from the provider backend */}
      {providers.map((p) => (
        <Card key={p.name} className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-lg font-bold text-white",
                  p.tone
                )}
              >
                {p.initial}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">{p.name}</h2>
                <p className="mt-0.5 text-sm text-slate-400">{p.desc}</p>
              </div>
            </div>
            <StatusBadge state={p.state} backendError={backendError} />
          </div>
        </Card>
      ))}

      {/* LinkedIn Sales Navigator — link-based, no backend credentials */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-lg font-bold text-white">
              in
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">LinkedIn Sales Navigator</h2>
              <p className="mt-0.5 text-sm text-slate-400">
                Discovery opens a pre-filled Sales Navigator people search in your own signed-in seat. LinkedIn
                offers no public search API, so no key is stored and nothing is scraped.
              </p>
            </div>
          </div>
          <a
            href="https://www.linkedin.com/sales/home"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:text-sky-200"
          >
            Open Sales Navigator <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </Card>

      {/* Pipeline services (Gmail / AI / Apify) — status from /api/settings */}
      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Outbound pipeline services</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Used by the outreach pipeline (scrape → draft → human review → send). Managed in Settings.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {pipelineServices.map((s) => (
            <div key={s.name} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-200">{s.name}</p>
                <PipelineStatusBadge configured={s.configured} />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{s.envVar} (server-side only)</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">HubSpot CRM</h2>
            <p className="mt-0.5 text-sm text-slate-400">Sync personalized leads as HubSpot contacts and companies.</p>
          </div>
          <PipelineStatusBadge configured={hubspot?.connected ?? null} />
        </div>
        <p className="text-xs text-slate-500">Configure HUBSPOT_ACCESS_TOKEN in Settings, then sync from the API or your approved-lead workflow.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={syncHubSpot} loading={syncing} disabled={!hubspot?.connected || syncing}>
            Sync Personalized Leads
          </Button>
          {syncMessage && <span className="text-sm text-slate-400">{syncMessage}</span>}
        </div>
      </Card>

      {/* Provider-friendly placeholder */}
      <Card className="flex items-center gap-4 border-dashed">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-500">
          <Puzzle className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-slate-300">More providers coming soon</p>
          <p className="text-xs text-slate-500">
            The integration layer is provider-friendly — additional data providers can be added
            alongside Apollo and Sales Navigator.
          </p>
        </div>
      </Card>
    </div>
  );
}