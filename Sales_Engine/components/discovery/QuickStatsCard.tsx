"use client";

import { Button, Card } from "@/components/ui";
import type { StatsResponse } from "@/lib/types";

interface QuickStatsCardProps {
  stats: StatsResponse | null;
  error: string | null;
  onRetry: () => void;
}

/** Real pipeline counters from GET /api/stats. */
export function QuickStatsCard({ stats, error, onRetry }: QuickStatsCardProps) {
  const rows: [number | undefined, string, string][] = [
    [stats?.total, "Leads in pipeline", "text-white"],
    [stats?.scraped, "Scraped (context collected)", "text-sky-400"],
    [stats?.personalized, "Personalized", "text-emerald-400"],
  ];

  return (
    <Card className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-200">Quick Stats</h3>

      {error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
          <Button variant="secondary" className="mt-2 w-full !py-1 text-xs" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : stats === null ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
          Loading pipeline statistics...
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(([value, label, color]) => (
            <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <p className={`text-2xl font-semibold ${color}`}>{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
