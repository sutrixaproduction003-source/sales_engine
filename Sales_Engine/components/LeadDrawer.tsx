"use client";

import Link from "next/link";
import { X, Zap, ClipboardCheck } from "lucide-react";
import { cn } from "@/components/ui";
import { initials, timeAgo } from "@/lib/format";
import { PipelineLead } from "@/lib/types";
import { StateBadge } from "@/components/StateBadge";
import { STATE_CONFIGS, LIFECYCLE_STAGES } from "@/lib/states";
import {
  DrawerSection,
  DrawerContact,
  DrawerCompany,
  DrawerDigitalPresence,
  DrawerPersonalization,
  DrawerSocialProof,
} from "@/components/drawerParts";

/** Scoring badge component */
/** intentSignals is stored as a JSON-stringified array; tolerate bad data. */
function parseSignals(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function ScoreBadge({ label, score }: { label: string; score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return "bg-green-900 text-green-200";
    if (s >= 60) return "bg-blue-900 text-blue-200";
    if (s >= 40) return "bg-yellow-900 text-yellow-200";
    return "bg-slate-700 text-slate-300";
  };

  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${getColor(score)}`}>
      <span className="text-sm font-medium">{label}</span>
      <span className="font-semibold">{score}/100</span>
    </div>
  );
}

/** Lead details drawer — shows only real backend fields (N/A when missing). */
export function LeadDrawer({ lead, onClose }: { lead: PipelineLead | null; onClose: () => void }) {
  if (!lead) return null;
  const doneUpTo = LIFECYCLE_STAGES.indexOf(lead.status);

  const totalScore =
    ((lead.relevanceScore ?? 0) +
      (lead.intentScore ?? 0) +
      (lead.buyingPowerScore ?? 0)) /
    3;

  const hasScores = [lead.relevanceScore, lead.intentScore, lead.buyingPowerScore].some(
    (score) => (score ?? 0) > 0
  );

  const intentSignals = parseSignals(lead.intentSignals);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Lead details">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-slate-800 bg-slate-950 shadow-pop">
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-200">
              {initials(lead.name || lead.company)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-white">{lead.name || lead.email}</h2>
                <StateBadge state={lead.status} size="sm" />
              </div>
              <p className="truncate text-sm text-slate-400">
                {[lead.jobTitle, lead.company].filter(Boolean).join(" · ") || "No title or company"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Where this lead is in the pipeline */}
          <ol className="mt-4 flex items-center gap-1.5">
            {LIFECYCLE_STAGES.map((stage, i) => {
              const cfg = STATE_CONFIGS[stage];
              const done = lead.status !== "REJECTED" && i <= doneUpTo;
              return (
                <li key={stage} className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className={cn("h-1 rounded-full", done ? cfg.dot : "bg-slate-800")} />
                  <span className={cn("truncate text-[11px]", done ? "text-slate-300" : "text-slate-600")}>{cfg.label}</span>
                </li>
              );
            })}
          </ol>
          {lead.status === "PERSONALIZED" && (
            <Link
              href="/review"
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-amber-200 hover:text-amber-100"
            >
              <ClipboardCheck className="h-4 w-4" /> Review this draft in the Review Queue
            </Link>
          )}
        </div>

        <div className="space-y-5 p-5">
          {/* Scoring Section */}
          {hasScores && (
            <DrawerSection title={<span className="flex items-center gap-2"><Zap className="h-3.5 w-3.5" /> Lead score</span>}>
              <div className="space-y-3">
                <div className="text-center rounded-lg bg-slate-900 px-3 py-2">
                  <p className="text-2xl font-bold text-white">{Math.round(totalScore)}/100</p>
                  <p className="text-xs text-slate-400">Overall Score</p>
                </div>
                <div className="space-y-2">
                  <ScoreBadge label="Relevance" score={lead.relevanceScore ?? 0} />
                  <ScoreBadge label="Intent" score={lead.intentScore ?? 0} />
                  <ScoreBadge label="Buying Power" score={lead.buyingPowerScore ?? 0} />
                </div>

                {/* Business Classification */}
                <div className="space-y-2">
                  {lead.businessType && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Business Type:</span>
                      <span className="font-medium text-slate-200">{lead.businessType}</span>
                    </div>
                  )}
                  {lead.classification && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Classification:</span>
                      <span className="font-medium text-slate-200">{lead.classification.replace(/_/g, " ")}</span>
                    </div>
                  )}
                  {lead.decisionMakerTier && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Decision Maker:</span>
                      <span className="font-medium text-slate-200">{lead.decisionMakerTier}</span>
                    </div>
                  )}
                </div>

                {/* Intent Signals */}
                {intentSignals.length > 0 && (
                  <div className="space-y-2 border-t border-slate-800 pt-3">
                    <p className="text-xs font-medium text-slate-300">Intent Signals:</p>
                    <ul className="space-y-1">
                      {intentSignals.map((signal: string, i: number) => (
                        <li key={i} className="text-xs text-slate-400">• {signal}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </DrawerSection>
          )}

          {DrawerContact(lead)}
          {DrawerPersonalization(lead)}
          {DrawerCompany(lead)}
          {DrawerDigitalPresence(lead)}
          {DrawerSocialProof(lead)}

          <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-800 pt-4 text-xs text-slate-500">
            <span title={lead.createdAt ? new Date(lead.createdAt).toLocaleString() : undefined}>Added {timeAgo(lead.createdAt)}</span>
            <span title={lead.updatedAt ? new Date(lead.updatedAt).toLocaleString() : undefined}>Updated {timeAgo(lead.updatedAt)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}