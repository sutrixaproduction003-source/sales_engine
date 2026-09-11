import React from "react";
import { LeadState, STATE_CONFIGS } from "@/lib/states";

interface StateBadgeProps {
  state: LeadState | string;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

export function StateBadge({
  state,
  size = "md",
  showIcon = true,
  className = "",
}: StateBadgeProps) {
  const config = STATE_CONFIGS[state as LeadState] ?? {
    label: state,
    color: "slate",
    bg: "bg-slate-800",
    border: "border-slate-700",
    text: "text-slate-300",
    dot: "bg-slate-400",
    icon: null,
  };

  const IconComponent = config.icon;

  const sizeStyles = {
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2.5 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.bg} ${config.border} ${config.text} ${sizeStyles[size]} ${className}`}
    >
      <span className={`inline-block shrink-0 rounded-full ${config.dot} ${size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"}`} />
      {showIcon && IconComponent && (
        <IconComponent className={`${iconSizes[size]} shrink-0 opacity-80`} />
      )}
      <span>{config.label}</span>
    </span>
  );
}
