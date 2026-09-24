"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowRight, AlertTriangle } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { MapDiscovery } from "@/components/MapDiscovery";
import { KpiCard, PipelineCard } from "@/components/overviewCards";
import { refreshLeads } from "@/lib/leadStore";
import { LeadState } from "@/lib/states";
import type { StatsResponse } from "@/lib/types";
import { useStats } from "@/lib/useStats";

/**
 * Overview — fully data-driven:
 *  - Lead map                  → Google Maps scrape via /api/places/search
 *  - KPIs / Pipeline Overview  → GET /api/stats (real pipeline DB counters)
 */
export default function OverviewPage() {
  const router = useRouter();
  const { stats, error: statsError, reload: loadStats } = useStats();

  const refreshAll = useCallback(async () => {
    await Promise.all([loadStats(), refreshLeads()]);
  }, [loadStats]);

  useEffect(() => {
    refreshLeads();
  }, []);

  const s: StatsResponse = stats ?? { total: 0, pending: 0, scraped: 0, personalized: 0, synced: 0 };
  const kpis: [string, number][] = [
    ["Total Leads", s.total],
    ["Pending", s.pending],
    ["Scraped", s.scraped],
    ["Personalized", s.personalized],
    ["Outreach Sent", s.synced],
  ];
  const pipeline: [LeadState, number][] = [
    ["PENDING", s.pending],
    ["SCRAPED", s.scraped],
    ["PERSONALIZED", s.personalized],
    ["SYNCED", s.synced],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Overview</h1>
          <p className="text-sm text-slate-400">Outbound pipeline health — from discovery to dispatch.</p>
        </div>
        <Button variant="secondary" className="ml-auto !py-1.5" onClick={refreshAll}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Card className="!p-4">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-white">Find leads on the map</h2>
          <p className="text-xs text-slate-400">
            Pick a location and project — businesses are scraped from Google Maps, pinned at their exact address,
            and saved to the pipeline.
          </p>
        </div>
        <MapDiscovery />
      </Card>

      {statsError ? (
        <Card className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">Unable to load pipeline statistics.</p>
            <p className="text-xs text-slate-400">{statsError}</p>
          </div>
          <Button variant="secondary" onClick={loadStats}>Retry</Button>
        </Card>
      ) : stats === null ? (
        <Card>
          <p className="text-sm text-slate-400">Loading pipeline statistics...</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {kpis.map(([label, value]) => (
              <KpiCard key={label} label={label} value={value} />
            ))}
          </div>

          {PipelineCard(pipeline)}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/15 text-orange-400">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-base font-medium text-white">
                    {s.personalized > 0
                      ? `${s.personalized} personalized leads are waiting for human review`
                      : "No leads are currently waiting for review"}
                  </p>
                  <p className="text-sm text-slate-400">
                    AI-generated messages need your approval before they can be queued for dispatch.
                  </p>
                </div>
              </div>
              <Button variant="secondary" onClick={() => router.push("/review")}>
                Open Review Queue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </>
      )}

    </div>
  );
}