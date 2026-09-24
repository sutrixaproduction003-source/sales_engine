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
    color: "orange",
    bg: "bg-orange-500/15",
    border: "border-orange-500/40",
    text: "text-orange-400",
    dot: "bg-orange-400",
    icon: Clock,
  },
  SCRAPED: {
    label: "Scraped",
    description: "Website context collected, ready for AI personalization",
    color: "sky",
    bg: "bg-sky-500/15",
    border: "border-sky-500/30",
    text: "text-sky-400",
    dot: "bg-sky-400",
    icon: Globe,
  },
  PERSONALIZED: {
    label: "Personalized",
    description: "Email drafted — waiting for human review",
    color: "emerald",
    bg: "bg-emerald-500/20",
    border: "border-emerald-500/50",
    text: "text-emerald-300",
    dot: "bg-emerald-300",
    icon: Sparkles,
  },
  SYNCED: {
    label: "Sent",
    description: "Approved in review and emailed",
    color: "violet",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    text: "text-violet-400",
    dot: "bg-violet-400",
    icon: Send,
  },
  REJECTED: {
    label: "Rejected",
    description: "Draft rejected in review — not sent",
    color: "rose",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    text: "text-rose-400",
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