import { Clock, Globe, Send, Sparkles } from "lucide-react";
import type { ComponentType } from "react";

/**
 * Pipeline states — mirrored from the REAL backend contract:
 * the pipeline Lead model (lib/leadModel LeadStatus) and GET /api/stats:
 *   PENDING → SCRAPED → PERSONALIZED → SYNCED
 * The frontend displays only states actually returned by the backend.
 */
export type LeadState = "PENDING" | "SCRAPED" | "PERSONALIZED" | "SYNCED";

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
    description: "AI-generated icebreaker ready for review",
    color: "emerald",
    bg: "bg-emerald-500/20",
    border: "border-emerald-500/50",
    text: "text-emerald-300",
    dot: "bg-emerald-300",
    icon: Sparkles,
  },
  SYNCED: {
    label: "Outreach Sent",
    description: "Pushed to the sending platform",
    color: "violet",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    text: "text-violet-400",
    dot: "bg-violet-400",
    icon: Send,
  },
};

export const LIFECYCLE_STAGES: LeadState[] = [
  "PENDING",
  "SCRAPED",
  "PERSONALIZED",
  "SYNCED",
];