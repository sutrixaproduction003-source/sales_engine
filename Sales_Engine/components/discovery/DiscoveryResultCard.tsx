"use client";

import { CheckCircle2, Mail, Phone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import type { DiscoveryLead } from "@/lib/types";

const CATEGORY_LABELS: Record<string, string> = {
  channel_partner: "Channel Partner",
  direct_customer: "Direct Customer",
};

/** "wedding_event_manager" -> "Wedding Event Manager" */
const titleCase = (value: string) =>
  value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

function RatingLine({ lead }: { lead: DiscoveryLead }) {
  if (typeof lead.googleRating === "number") {
    return (
      <span className="text-amber-300">
        Google {lead.googleRating.toFixed(1)}/5
        {typeof lead.totalReviewsCount === "number"
          ? ` · ${lead.totalReviewsCount.toLocaleString()} reviews`
          : ""}
      </span>
    );
  }
  if (lead.googleMapsLink) {
    return (
      <a href={lead.googleMapsLink} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200">
        Check Google rating
      </a>
    );
  }
  return null;
}

function ClassificationBadges({ lead }: { lead: DiscoveryLead }) {
  const hasConfidence = typeof lead.classificationConfidence === "number";
  if (!lead.category && !lead.subCategory && !hasConfidence) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {lead.category && (
        <span className="rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-300">
          {CATEGORY_LABELS[lead.category] ?? lead.category}
        </span>
      )}
      {lead.subCategory && (
        <span className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-300">
          {titleCase(lead.subCategory)}
        </span>
      )}
      {hasConfidence && (
        <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300">
          Classification: {Math.round((lead.classificationConfidence as number) * 100)}%
        </span>
      )}
    </div>
  );
}

function ContactInfo({ lead }: { lead: DiscoveryLead }) {
  return (
    <div className="mt-2 space-y-1">
      {lead.email && (
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Mail className="h-3.5 w-3.5 text-sky-400" />
          <span className="truncate">{lead.email}</span>
        </div>
      )}
      {lead.phone && (
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Phone className="h-3.5 w-3.5 text-emerald-400" />
          <span>{lead.phone}</span>
        </div>
      )}
      {!lead.email && !lead.phone && (
        <p className="text-[11px] text-slate-500">Contact information not available from discovery.</p>
      )}
    </div>
  );
}

interface DiscoveryResultCardProps {
  lead: DiscoveryLead;
  canEnrich: boolean;
  isEnriching: boolean;
  enrichDisabled: boolean;
  onEnrich: () => void;
}

export function DiscoveryResultCard({ lead, canEnrich, isEnriching, enrichDisabled, onEnrich }: DiscoveryResultCardProps) {
  const displayName = lead.fullName || `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Unknown person";

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{displayName}</p>
          <p className="mt-1 text-xs text-slate-400">
            {lead.jobTitle || "Job title unavailable"}
            {lead.companyName ? ` · ${lead.companyName}` : ""}
          </p>
          {lead.location && <p className="mt-1 text-xs text-slate-500">{lead.location}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <RatingLine lead={lead} />
          </div>

          <ClassificationBadges lead={lead} />
          <ContactInfo lead={lead} />
        </div>

        {canEnrich && (
          <div className="shrink-0">
            {lead.email || lead.phone ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Enriched
              </div>
            ) : (
              <Button
                variant="secondary"
                onClick={onEnrich}
                loading={isEnriching}
                disabled={enrichDisabled}
                className="whitespace-nowrap"
              >
                <Sparkles className="h-4 w-4" />
                {isEnriching ? "Enriching..." : "Enrich & Save"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
