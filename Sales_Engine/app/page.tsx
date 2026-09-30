"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { RefreshCw, ArrowRight, AlertTriangle, ClipboardCheck, Users } from "lucide-react";
import { Button, Card, PageHeader, SectionHeader } from "@/components/ui";
import { MapDiscovery } from "@/components/MapDiscovery";
import { StatTile } from "@/components/overviewCards";
import { refreshLeads } from "@/lib/leadStore";
import type { StatsResponse } from "@/lib/types";
import { useStats } from "@/lib/useStats";

/**
 * Overview — fully data-driven:
 *  - Pipeline numbers  → GET /api/stats (real pipeline counters)
 *  - Lead map          → Google Maps scrape via /api/places/search
 */
export default function OverviewPage() {
  const { stats, error: statsError, reload: loadStats } = useStats();

  const refreshAll = useCallback(async () => {
    await Promise.all([loadStats(), refreshLeads()]);
  }, [loadStats]);

  useEffect(() => {
    refreshLeads();
  }, []);

  const s: StatsResponse = stats ?? { total: 0, pending: 0, scraped: 0, personalized: 0, synced: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Your outbound pipeline, from discovery to dispatch."
        actions={
          <Button variant="secondary" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {statsError ? (
        <Card className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/20">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">Couldn&apos;t load pipeline numbers.</p>
            <p className="text-xs text-slate-400">{statsError}</p>
          </div>
          <Button variant="secondary" onClick={loadStats}>Retry</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatTile label="Total leads" value={s.total} icon={Users} href="/leads" hint={stats ? "Everything in the pipeline" : "Loading…"} />
          <StatTile label="New" value={s.pending} state="PENDING" hint="Not yet enriched" />
          <StatTile label="Scraped" value={s.scraped} state="SCRAPED" hint="Website context collected" />
          <StatTile label="Awaiting review" value={s.personalized} state="PERSONALIZED" href="/review" hint="Drafted, needs approval" />
          <StatTile label="Sent" value={s.synced} state="SYNCED" href="/dispatch" hint="Approved and emailed" />
        </div>
      )}

      {stats && s.personalized > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
          <ClipboardCheck className="h-5 w-5 shrink-0 text-amber-300" />
          <p className="min-w-0 flex-1 text-sm text-slate-200">
            <span className="font-semibold text-white">{s.personalized} drafts</span> are waiting for your review. Nothing is
            sent until you approve it.
          </p>
          <Link
            href="/review"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-200 hover:text-amber-100"
          >
            Open Review Queue <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <Card className="!p-4 sm:!p-5">
        <SectionHeader
          title="Find leads on the map"
          description="Pick a location and a project. Matching businesses are found on Google Maps, pinned at their exact address and saved to your pipeline."
        />
        <MapDiscovery />
      </Card>
    </div>
  );
}
