"use client";

import { Card } from "@/components/ui";
import { Globe, DatabaseZap } from "lucide-react";

export default function ScrapingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Scraping</h1>
        <p className="text-sm text-slate-400">Map and web enrichment flow for new lead discovery.</p>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-medium text-white">Lead scraping pipeline</p>
            <p className="text-sm text-slate-400">Ready to pull in fresh company and contact signals.</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300">
          Use the Overview action panel to run the scraping workflow and push results into your lead queue.
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          <DatabaseZap className="h-4 w-4 text-emerald-400" />
          Pipeline status: idle but connected
        </div>
      </Card>
    </div>
  );
}
