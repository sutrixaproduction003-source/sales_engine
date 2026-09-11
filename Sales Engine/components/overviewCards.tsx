"use client";

import { Users, Telescope, Clock, Sparkles, Send } from "lucide-react";
import { Card } from "@/components/ui";
import { STATE_CONFIGS, LeadState } from "@/lib/states";

export function iconFor(label: string) {
  const cls = "h-4 w-4 text-current";
  switch (label) {
    case "Total Leads": return <Users className={cls} />;
    case "Pending": return <Clock className={cls} />;
    case "Scraped": return <Telescope className={cls} />;
    case "Personalized": return <Sparkles className={cls} />;
    case "Outreach Sent": return <Send className={cls} />;
    default: return <Send className={cls} />;
  }
}

const KPI_TONE: Record<string, string> = {
  "Total Leads": "text-slate-200 bg-slate-800",
  Pending: "text-orange-400 bg-orange-500/15",
  Scraped: "text-sky-400 bg-sky-500/15",
  Personalized: "text-emerald-400 bg-emerald-500/15",
  "Outreach Sent": "text-violet-400 bg-violet-500/15",
};

export function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="!p-3.5">
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${KPI_TONE[label] ?? "bg-slate-800"}`}>
        {iconFor(label)}
      </span>
      <p className="mt-1.5 text-2xl font-semibold text-white">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </Card>
  );
}

export function PipelineCard(pairs: [LeadState, number][]) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-200">Pipeline Overview</h2>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">Live</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {pairs.map(([state, count], i) => {
          const cfg = STATE_CONFIGS[state];
          return (
            <div key={state} className="flex items-center">
              {i > 0 && <Arrow className="mx-1 h-4 w-4 text-slate-600" />}
              <div className={`rounded-xl border px-3 py-2 ${cfg.bg} ${cfg.border}`}>
                <p className={`text-lg font-semibold ${cfg.text}`}>{count}</p>
                <p className="text-[11px] text-slate-400">{cfg.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function Chip({ state, count, alt = false }: { state: LeadState; count: number; alt?: boolean }) {
  const cfg = STATE_CONFIGS[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${alt ? "border-slate-700 bg-slate-800 text-slate-400" : `${cfg.bg} ${cfg.border} ${cfg.text}`}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}: {count}
    </span>
  );
}

function Arrow({ className = "" }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M6 12l12 0" strokeLinecap="round" /></svg>;
}