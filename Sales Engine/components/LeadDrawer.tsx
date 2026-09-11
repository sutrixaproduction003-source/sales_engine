"use client";

import { X, CheckCircle2, Circle, Zap } from "lucide-react";
import { PipelineLead } from "@/lib/types";
import { StateBadge } from "@/components/StateBadge";
import { STATE_CONFIGS, LIFECYCLE_STAGES } from "@/lib/states";
import {
  DrawerSection,
  DrawerContact,
  DrawerCompany,
  DrawerDigitalPresence,
  DrawerHotelProfile,
  DrawerPersonalization,
  DrawerSocialProof,
} from "@/components/drawerParts";

/** Scoring badge component */
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

  const intentSignals = lead.intentSignals
    ? JSON.parse(lead.intentSignals)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-slate-700 bg-slate-950 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-800 bg-slate-950/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{lead.name || lead.email}</h2>
              <StateBadge state={lead.status} />
            </div>
            <p className="text-sm text-slate-400">
              {lead.jobTitle || "N/A"} · {lead.company || "N/A"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Scoring Section */}
          {(lead.relevanceScore ?? lead.intentScore ?? lead.buyingPowerScore) && (
            <DrawerSection title={<div className="flex items-center gap-2"><Zap className="h-4 w-4" /> Lead Score</div>}>
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
          {DrawerHotelProfile(lead)}
          {DrawerCompany(lead)}
          {DrawerDigitalPresence(lead)}
          {DrawerSocialProof(lead)}
          {DrawerPersonalization(lead)}

          <DrawerSection title="Pipeline Lifecycle">
            <ol className="space-y-1">
              {LIFECYCLE_STAGES.map((s, i) => {
                const cfg = STATE_CONFIGS[s];
                const done = i <= doneUpTo;
                return (
                  <li key={s} className="flex items-center gap-2.5 text-sm">
                    {done ? (
                      <CheckCircle2 className={`h-4 w-4 ${cfg.text}`} />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-600" />
                    )}
                    <span className={done ? "text-slate-200" : "text-slate-500"}>{cfg.label}</span>
                  </li>
                );
              })}
            </ol>
          </DrawerSection>

          <DrawerSection title="Timestamps">
            <p className="text-xs text-slate-400">Created: {lead.createdAt || "N/A"}</p>
            <p className="text-xs text-slate-400">Last activity: {lead.updatedAt || "N/A"}</p>
          </DrawerSection>
        </div>
      </div>
    </div>
  );
}