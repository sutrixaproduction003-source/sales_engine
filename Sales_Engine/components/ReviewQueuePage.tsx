"use client";

import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  Mail,
  ShieldCheck,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card, Button, Badge, cn } from "@/components/ui";
import { fetchLeads } from "@/lib/leadService";
import { PipelineLead } from "@/lib/types";

/**
 * Review Queue — pending items are REAL leads from the backend whose AI
 * icebreaker has been generated (status PERSONALIZED).
 */

function KpiPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex min-w-[110px] flex-col rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2.5">
      <span className={cn("text-xl font-semibold", color)}>{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
    </div>
  );
}

export function ReviewQueuePageContent() {
  const [leads, setLeads] = useState<PipelineLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = () => {
    setError(null);
    fetchLeads()
      .then((data) => setLeads((data.leads ?? []).filter((l) => l.status === "PERSONALIZED")))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load the review queue.")
      );
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (leadId: number, decision: "approve" | "reject") => {
    setSavingId(leadId);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save review decision.");
      setLeads((current) => current?.filter((lead) => lead.id !== leadId) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save review decision.");
    } finally {
      setSavingId(null);
    }
  };

  const pendingCount = leads?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Human Review Queue</h1>
            <p className="text-sm text-slate-400">
              {pendingCount > 0 ? (
                <>
                  <span className="font-semibold text-orange-400">{pendingCount} messages</span> pending review —
                  approve, edit, or reject before dispatch
                </>
              ) : (
                "Queue clear — all messages have been reviewed"
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          AI Generated → Pending Review → Approval → Queued
        </div>
      </div>

      {/* KPI pill */}
      <div className="flex flex-wrap gap-3">
        <KpiPill label="Pending Review" value={pendingCount} color="text-orange-400" />
      </div>

      {/* Cards */}
      {error ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-rose-400" />
          <p className="text-sm font-medium text-slate-300">Unable to load the review queue.</p>
          <p className="max-w-sm text-xs text-slate-500">{error}</p>
          <Button variant="secondary" className="mt-2" onClick={load}>
            Retry
          </Button>
        </Card>
      ) : leads === null ? (
        <Card>
          <p className="text-sm text-slate-400">Loading review queue...</p>
        </Card>
      ) : leads.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          <p className="text-sm font-medium text-slate-300">Nothing here right now</p>
          <p className="max-w-sm text-xs text-slate-500">
            Messages appear in this queue as AI personalization completes and moves into the review gate.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {leads.map((lead) => (
            <Card key={lead.id} className="space-y-4">
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-300">
                    {(lead.name || lead.email || "?")
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-white">{lead.name || "N/A"}</p>
                    <p className="text-sm text-slate-400">
                      {lead.jobTitle || "N/A"} · {lead.company || "N/A"}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-300">
                      <Mail className="h-3.5 w-3.5 text-slate-500" />
                      {lead.email}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge color="violet">
                        <Sparkles className="mr-1 h-3 w-3" /> AI Generated
                      </Badge>
                      <Badge color="sky">
                        <ShieldCheck className="mr-1 h-3 w-3" /> {lead.email ? "In pipeline" : "N/A"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <span className="rounded-full border border-orange-500/40 bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-400">
                  Pending Review
                </span>
              </div>

              {/* AI-generated content — only real backend fields */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</p>
                <p className="mt-0.5 text-slate-300">N/A</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  AI-generated body (icebreaker)
                </p>
                <p className="mt-1 whitespace-pre-line leading-relaxed text-slate-300">
                  {lead.icebreaker || "N/A"}
                </p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">AI confidence</p>
                <p className="mt-0.5 text-slate-300">N/A</p>
                {lead.scrapedContext && (
                  <>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Personalization signal — scraped website context
                    </p>
                    <p className="mt-1 line-clamp-3 text-xs text-slate-400">{lead.scrapedContext}</p>
                  </>
                )}
              </div>

              {/* Decisions persist to the leads spreadsheet. */}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" disabled={savingId === lead.id} title="Editing message content is not implemented yet">
                  Edit
                </Button>
                <Button variant="danger" loading={savingId === lead.id} onClick={() => decide(lead.id, "reject")}>
                  Reject
                </Button>
                <Button variant="success" loading={savingId === lead.id} onClick={() => decide(lead.id, "approve")}>
                  Approve &amp; Queue
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}