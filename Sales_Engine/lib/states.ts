import { Clock, Globe, Send, Sparkles, XCircle } from "lucide-react";
import type { ComponentType } from "react";

/**
 * Pipeline states (lib/leadModel LeadStatus):
 *   PENDING → SCRAPED → PERSONALIZED (awaiting human review) → SYNCED (sent)
 * REJECTED leads were declined in review and are never sent.
 */
export type LeadState = "PENDING" | "SCRAPED" | "PERSONALIZED" | "SYNCED" | "REJECTED";

export interface StateConfig {
  label: string;
  description: string;
  color: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
  icon: ComponentType<{ className?: string }>;
}

export const STATE_CONFIGS: Record<LeadState, StateConfig> = {
  PENDING: {
    label: "New",
    description: "Lead imported or discovered — awaiting enrichment",
    color: "slate",
    bg: "bg-slate-800",
    border: "border-slate-700",
    text: "text-slate-300",
    dot: "bg-slate-400",
    icon: Clock,
  },
  SCRAPED: {
    label: "Scraped",
    description: "Website context collected, ready for AI personalization",
    color: "indigo",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/30",
    text: "text-indigo-300",
    dot: "bg-indigo-400",
    icon: Globe,
  },
  PERSONALIZED: {
    label: "Personalized",
    description: "Email drafted — waiting for human review",
    color: "amber",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-300",
    dot: "bg-amber-400",
    icon: Sparkles,
  },
  SYNCED: {
    label: "Sent",
    description: "Approved in review and emailed",
    color: "emerald",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
    icon: Send,
  },
  REJECTED: {
    label: "Rejected",
    description: "Draft rejected in review — not sent",
    color: "rose",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    text: "text-rose-300",
    dot: "bg-rose-400",
    icon: XCircle,
  },
};

export const LIFECYCLE_STAGES: LeadState[] = [
  "PENDING",
  "SCRAPED",
  "PERSONALIZED",
  "SYNCED",
];