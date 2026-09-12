"use client";

import { Card } from "@/components/ui";
import { Inbox, MailOpen } from "lucide-react";

export default function InboxesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Inboxes</h1>
        <p className="text-sm text-slate-400">Track replies, follow-ups, and delivery health in one place.</p>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-medium text-white">Inbox overview</p>
            <p className="text-sm text-slate-400">Message and reply status will appear once sending is active.</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300">
          This workspace is ready to surface reply volume, bounce issues, and engagement activity.
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          <MailOpen className="h-4 w-4 text-sky-400" />
          Inbox health: monitoring enabled
        </div>
      </Card>
    </div>
  );
}
