"use client";

import { useEffect, useState } from "react";
import { Send, MailCheck, Clock, Inbox, AlertTriangle } from "lucide-react";
import { Card, Button, Modal, cn } from "@/components/ui";
import { fetchLeads } from "@/lib/leadService";
import { PipelineLead } from "@/lib/types";

/**
 * Dispatch — Email Outbox: emails that a reviewer approved in the Review
 * Queue and that were sent through Gmail (status SYNCED). Read-only.
 */

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: typeof Send;
  color: string;
  bg: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", bg, color)}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className={cn("text-xl font-semibold", color)}>{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </Card>
  );
}

export function DispatchPageContent() {
  const [leads, setLeads] = useState<PipelineLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PipelineLead | null>(null);

  const load = () => {
    setError(null);
    fetchLeads()
      .then((data) => setLeads(data.leads ?? []))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load the dispatch outbox.")
      );
  };

  useEffect(() => {
    load();
  }, []);

  const sent = (leads ?? []).filter((l) => l.status === "SYNCED");
  const awaitingReview = (leads ?? []).filter((l) => l.status === "PERSONALIZED" && l.email);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
          <Send className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white">Dispatch — Email Outbox</h1>
          <p className="text-sm text-slate-400">
            Emails you approved in the Review Queue and sent through Gmail. Nothing is sent automatically.
          </p>
        </div>
      </div>

      {/* KPI cards — real pipeline counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="Sent via Gmail" value={sent.length} icon={MailCheck} color="text-sky-400" bg="bg-sky-500/15" />
        <KpiCard label="Waiting for your review" value={awaitingReview.length} icon={Clock} color="text-indigo-400" bg="bg-indigo-500/15" />
        <KpiCard label="Pipeline total" value={leads?.length ?? 0} icon={Inbox} color="text-slate-300" bg="bg-slate-800" />
      </div>

      {/* Table */}
      {error ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-rose-400" />
          <p className="text-sm font-medium text-slate-300">Unable to load the dispatch outbox.</p>
          <p className="max-w-sm text-xs text-slate-500">{error}</p>
          <Button variant="secondary" className="mt-2" onClick={load}>
            Retry
          </Button>
        </Card>
      ) : leads === null ? (
        <Card>
          <p className="text-sm text-slate-400">Loading dispatch outbox...</p>
        </Card>
      ) : sent.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <Inbox className="h-8 w-8 text-slate-500" />
          <p className="text-sm font-medium text-slate-300">No dispatched emails yet</p>
          <p className="max-w-sm text-xs text-slate-500">
            Emails appear here after you click Approve &amp; send in the Review Queue.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                  <th className="px-5 py-3 font-medium">Lead</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Subject</th>
                  <th className="px-5 py-3 font-medium">Sent At</th>
                  <th className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {sent.map((lead) => (
                  <tr key={lead.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-100">{lead.name || "N/A"}</p>
                      <p className="text-xs text-slate-500">{lead.company || "N/A"}</p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-300">{lead.email}</td>
                    <td className="max-w-xs truncate px-5 py-3.5 text-slate-300">{lead.emailSubject || "—"}</td>
                    <td className="px-5 py-3.5 text-slate-400">
                      {lead.sentAt ? new Date(lead.sentAt).toLocaleString() : "N/A"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {lead.emailBody ? (
                        <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setViewing(lead)}>
                          View Sent Email
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-500">No stored copy</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
            <Inbox className="h-3.5 w-3.5" />
            Sent emails are locked — a lead can only be sent once, and only after human approval.
          </div>
        </Card>
      )}

      {/* View sent email modal */}
      <Modal open={viewing !== null} onClose={() => setViewing(null)} title="Sent Email">
        {viewing && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm">
              <div className="mb-3 space-y-1">
                <p className="text-slate-400">
                  To: <span className="text-slate-200">{viewing.email}</span>
                </p>
                <p className="text-slate-400">
                  Sent:{" "}
                  <span className="text-slate-200">
                    {viewing.sentAt ? new Date(viewing.sentAt).toLocaleString() : "N/A"}
                  </span>
                </p>
                <p className="text-slate-400">
                  Subject: <span className="text-slate-200">{viewing.emailSubject || "—"}</span>
                </p>
              </div>
              <p className="whitespace-pre-line leading-relaxed text-slate-300">{viewing.emailBody || "N/A"}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <MailCheck className="h-4 w-4" /> The exact email that was sent — read-only.
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setViewing(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}