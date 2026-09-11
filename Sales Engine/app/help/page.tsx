"use client";

import { Card } from "@/components/ui";
import { HelpCircle, BookOpen } from "lucide-react";

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Help</h1>
        <p className="text-sm text-slate-400">Quick references for the outbound sales workflow.</p>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-slate-200">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-medium text-white">Getting started</p>
            <p className="text-sm text-slate-400">A quick checklist for getting from imported leads to outbound sending.</p>
          </div>
        </div>

        <div className="space-y-3 text-sm text-slate-300">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <p className="font-medium text-white">1. Import leads</p>
            <p className="mt-1 text-slate-400">Upload a CSV from the Leads Hub page.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <p className="font-medium text-white">2. Scrape and enrich</p>
            <p className="mt-1 text-slate-400">Run the Overview actions to gather context and personalize messaging.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <p className="font-medium text-white">3. Launch campaigns</p>
            <p className="mt-1 text-slate-400">Use the campaign and inbox sections to monitor the outbound flow.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          <BookOpen className="h-4 w-4 text-emerald-400" />
          Documentation is ready for expansion as the pipeline grows.
        </div>
      </Card>
    </div>
  );
}
