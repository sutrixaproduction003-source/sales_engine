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

const BUTTON_VARIANTS = {
  primary: "bg-indigo-600 text-white shadow-sm shadow-indigo-950/40 ring-1 ring-inset ring-white/10 hover:bg-indigo-500",
  secondary: "bg-slate-800/70 text-slate-100 ring-1 ring-inset ring-slate-700/80 hover:bg-slate-800 hover:ring-slate-600",
  ghost: "text-slate-300 hover:bg-slate-800/70 hover:text-white",
  danger: "bg-rose-600 text-white ring-1 ring-inset ring-white/10 hover:bg-rose-500",
  success: "bg-emerald-600 text-white ring-1 ring-inset ring-white/10 hover:bg-emerald-500",
} as const;

export function Button({
  children, variant = "primary", loading = false, className = "", disabled, onClick, type = "button", title,
}: {
  children: React.ReactNode;
  variant?: keyof typeof BUTTON_VARIANTS;
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
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
        BUTTON_VARIANTS[variant],
        (disabled || loading) && "pointer-events-none opacity-50",
        className
      )}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-card", className)}>{children}</div>
  );
}

/** Page title row: optional icon, title, one-line description, and actions on the right. */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-300 ring-1 ring-inset ring-indigo-500/20">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-slate-400">{description}</p>}
          {children}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
    </div>
  );
}

/** Heading inside a card: title, optional description, optional actions. */
export function SectionHeader({
  title,
  description,
  actions,
  className = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-start gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-white">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-slate-400">{description}</p>}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

const BADGE_PALETTE: Record<string, string> = {
  slate: "bg-slate-800 text-slate-300 ring-slate-700/60",
  amber: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
  sky: "bg-indigo-500/10 text-indigo-300 ring-indigo-500/20",
  emerald: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
  rose: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
  teal: "bg-teal-500/10 text-teal-300 ring-teal-500/20",
  violet: "bg-indigo-500/10 text-indigo-300 ring-indigo-500/20",
  orange: "bg-orange-500/10 text-orange-300 ring-orange-500/20",
  indigo: "bg-indigo-500/10 text-indigo-300 ring-indigo-500/20",
  purple: "bg-purple-500/10 text-purple-300 ring-purple-500/20",
  red: "bg-red-500/10 text-red-300 ring-red-500/20",
  zinc: "bg-zinc-500/10 text-zinc-300 ring-zinc-500/20",
};

export function Badge({ children, color = "slate", className = "" }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        BADGE_PALETTE[color] ?? BADGE_PALETTE.slate,
        className
      )}
    >
      {children}
    </span>
  );
}

/** Shared field look (width is set per control). */
const FIELD =
  "rounded-lg border border-slate-700/80 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-sm transition-colors " +
  "placeholder:text-slate-500 hover:border-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, "w-full", className)} {...props} />;
}

export function Select({ className = "", children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select className={cn(FIELD, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD, "w-full leading-relaxed", className)} {...props} />;
}

export function Label({ children, className = "", ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-[13px] font-medium text-slate-300", className)} {...props}>{children}</label>
  );
}

export function EmptyState({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700/80 bg-slate-900/40 px-6 py-12 text-center">
      {icon && (
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-400">{icon}</div>
      )}
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {description && <p className="max-w-sm text-[13px] leading-relaxed text-slate-500">{description}</p>}
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
      <div className={cn("relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-pop", className)}>
        <div className="mb-4 flex items-center justify-between">
          {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close">
            <XMark />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
