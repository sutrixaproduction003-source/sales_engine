"use client";

import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui";
import { STATE_CONFIGS, type LeadState } from "@/lib/states";

/** One pipeline number: stage colour dot, label, value, and where it links. */
export function StatTile({
  label,
  value,
  hint,
  href,
  state,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint?: string;
  href?: string;
  state?: LeadState;
  icon?: LucideIcon;
}) {
  const cfg = state ? STATE_CONFIGS[state] : null;
  const body = (
    <>
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-400">
        {cfg ? <span className={cn("h-2 w-2 rounded-full", cfg.dot)} /> : Icon && <Icon className="h-4 w-4 text-slate-500" />}
        {label}
        {href && <ArrowRight className="ml-auto h-3.5 w-3.5 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-400" />}
      </div>
      <p className="tabular mt-2 text-[28px] font-semibold leading-none tracking-tight text-white">{value.toLocaleString()}</p>
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </>
  );
  const cls = "group block rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-card transition-colors";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-slate-700 hover:bg-slate-850")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
