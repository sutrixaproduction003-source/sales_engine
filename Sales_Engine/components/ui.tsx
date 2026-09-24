import React from "react";

export function cn(...classes: Array<string | false | null | undefined | Record<string, boolean>>): string {
  return classes
    .filter(Boolean)
    .map((c) =>
      typeof c === "string" || typeof c === "number"
        ? c
        : Object.entries(c as Record<string, boolean>)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(" ")
    )
    .join(" ");
}

export function Button({
  children, variant = "primary", loading = false, className = "", disabled, onClick, type = "button", title,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  loading?: boolean;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  title?: string;
}) {
  return (
    <button
      type={type} onClick={onClick} disabled={disabled || loading} title={title}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
        "focus:outline-none focus:ring-2 focus:ring-indigo-500/50",
        variant === "primary" && "bg-indigo-600 hover:bg-indigo-500 text-white shadow",
        variant === "secondary" && "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700",
        variant === "ghost" && "text-slate-300 hover:bg-slate-800",
        variant === "danger" && "bg-rose-600/90 hover:bg-rose-500 text-white",
        variant === "success" && "bg-emerald-600 hover:bg-emerald-500 text-white",
        disabled && "opacity-50 pointer-events-none",
        loading && "opacity-60 pointer-events-none",
        className
      )}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur p-5", className)}>{children}</div>
  );
}

const BADGE_PALETTE: Record<string, string> = {
  slate: "bg-slate-800 text-slate-300",
  amber: "bg-amber-500/15 text-amber-400",
  sky: "bg-sky-500/15 text-sky-400",
  emerald: "bg-emerald-500/15 text-emerald-400",
  rose: "bg-rose-500/15 text-rose-400",
  teal: "bg-teal-500/15 text-teal-400",
  violet: "bg-violet-500/15 text-violet-400",
  orange: "bg-orange-500/15 text-orange-400",
  indigo: "bg-indigo-500/15 text-indigo-400",
  purple: "bg-purple-500/15 text-purple-400",
  red: "bg-red-500/15 text-red-400",
  zinc: "bg-zinc-500/15 text-zinc-400",
};

export function Badge({ children, color = "slate", className = "" }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", BADGE_PALETTE[color] ?? BADGE_PALETTE.slate, className)}>
      {children}
    </span>
  );
}
export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100",
        "placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className = "", children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      className={cn(
        "rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100",
        "focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100",
        "placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40",
        className
      )}
      {...props}
    />
  );
}

export function Label({ children, className = "", ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-sm font-medium text-slate-300", className)} {...props}>{children}</label>
  );
}

export function EmptyState({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-12 text-center">
      {icon && <div className="text-slate-500">{icon}</div>}
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-500">{description}</p>}
    </div>
  );
}

function XMark() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
export function Modal({
  open,
  onClose,
  children,
  title,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl", className)}>
        <div className="mb-4 flex items-center justify-between">
          {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
          <button onClick={onClose} className="text-slate-400 hover:text-white"><XMark /></button>
        </div>
        {children}
      </div>
    </div>
  );
}