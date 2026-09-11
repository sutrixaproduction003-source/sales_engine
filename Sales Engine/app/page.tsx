"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowRight, AlertTriangle } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { MapDiscovery } from "@/components/MapDiscovery";
import { KpiCard, PipelineCard } from "@/components/overviewCards";
import { getStats } from "@/lib/leadService";
import { refreshLeads, useLeadsStore } from "@/lib/leadStore";
import { LeadState } from "@/lib/states";
import type { StatsResponse } from "@/lib/types";

/**
 * Overview — fully data-driven:
 *  - KPIs / Pipeline Overview  → GET /api/stats (real pipeline DB counters)
 *  - Global Lead Distribution  → project discovery via POST /api/leads/discover
 *  - Recent Activity           → honest empty state (no activity endpoint yet)
 */
export default function OverviewPage() {
  const router = useRouter();
  const { leads } = useLeadsStore();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setStatsError(null);
    try {
      setStats(await getStats());
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : "Failed to load pipeline statistics.");
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadStats(), refreshLeads()]);
  }, [loadStats]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 !p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Global Lead Distribution</h2>
            <span className="text-xs text-slate-400">Dynamic discovery</span>
          </div>
          <MapDiscovery />
        </Card>
        <Card className="!p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Recent Activity</h2>
            <span className="text-xs text-slate-400">{leads.length} leads</span>
          </div>
          <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-3 py-6 text-center text-xs text-slate-500">
            No recent activity. Pipeline events will appear here once the backend exposes an activity feed.
          </p>
        </Card>
      </div>
    </div>
  );
}