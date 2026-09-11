"use client";

import { Card } from "@/components/ui";
import { Megaphone, Send } from "lucide-react";

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Campaigns</h1>
        <p className="text-sm text-slate-400">Launch and monitor outreach sequences across your lead list.</p>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/15 text-orange-400">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-medium text-white">Outbound campaign center</p>
            <p className="text-sm text-slate-400">Campaign planning and scheduling will appear here.</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300">
          This section is wired up for future sequencing, send volume, and performance tracking.
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Send className="h-4 w-4 text-amber-400" />
          Sequence status: waiting for launch setup
        </div>
      </Card>
    </div>
  );
}
