"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Globe,
  Sparkles,
  Settings as SettingsIcon,
  HelpCircle,
  Zap,
  ClipboardCheck,
  Send,
  Plug,
  UploadCloud,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/components/ui";

const groups: { label?: string; items: { href: string; label: string; icon: typeof Zap }[] }[] = [
  {
    label: "Pipeline",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/leads", label: "Leads Hub", icon: Users },
      { href: "/discovery", label: "Discovery", icon: Globe },
      { href: "/import", label: "Sales Nav Import", icon: UploadCloud },
    ],
  },
  {
    label: "AI & Review",
    items: [
      { href: "/personalization", label: "Personalization", icon: Sparkles },
      { href: "/review", label: "Review Queue", icon: ClipboardCheck },
      { href: "/dispatch", label: "Dispatch", icon: Send },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/settings", label: "Settings", icon: SettingsIcon },
      { href: "/help", label: "Help", icon: HelpCircle },
    ],
  },
];

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  window.location.href = "/login";
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-950/50 ring-1 ring-inset ring-white/15">
        <Zap className="h-4 w-4" />
      </span>
      <span className={cn("min-w-0 leading-tight", compact && "hidden lg:block")}>
        <span className="block text-sm font-semibold text-white">Sales Engine</span>
        <span className="block text-[11px] text-slate-500">Outbound pipeline</span>
      </span>
    </div>
  );
}

/**
 * Navigation. Phones: hidden, opened as a drawer from the top bar's menu
 * button (`open` / `onClose`). Tablets: an icon rail. Desktop: full sidebar.
 */
export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  /** `labels`: "always" in the drawer, "lg" (desktop only) in the rail. */
  const nav = (labels: "always" | "lg") => {
    const label = labels === "always" ? "inline" : "hidden lg:inline";
    return (
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2.5 py-4">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            {group.label && (
              <p
                className={cn(
                  "px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500",
                  labels === "lg" && "hidden lg:block"
                )}
              >
                {group.label}
              </p>
            )}
            {group.items.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors",
                    labels === "always" ? "py-2.5" : "justify-center py-2 lg:justify-start",
                    active ? "bg-slate-800/80 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  )}
                  title={link.label}
                >
                  {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-indigo-400" />}
                  <link.icon
                    className={cn("h-[18px] w-[18px] shrink-0", active ? "text-indigo-300" : "text-slate-500 group-hover:text-slate-300")}
                  />
                  <span className={label}>{link.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    );
  };

  const footer = (labels: "always" | "lg") => (
    <div className="border-t border-slate-800/80 p-2.5">
      <button
        onClick={signOut}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-900 hover:text-slate-100",
          labels === "lg" && "justify-center lg:justify-start"
        )}
        title="Sign out"
      >
        <LogOut className="h-[18px] w-[18px] shrink-0 text-slate-500" />
        <span className={labels === "always" ? "inline" : "hidden lg:inline"}>Sign out</span>
      </button>
    </div>
  );

  return (
    <>
      {/* Tablet rail / desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[68px] shrink-0 flex-col border-r border-slate-800/80 bg-slate-950 md:flex lg:w-60">
        <div className="flex h-14 items-center border-b border-slate-800/80 px-4">
          <Brand compact />
        </div>
        {nav("lg")}
        {footer("lg")}
      </aside>

      {/* Phone drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" aria-label="Close menu" onClick={onClose} />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-slate-800 bg-slate-950 shadow-pop">
            <div className="flex h-14 items-center gap-3 border-b border-slate-800/80 px-4">
              <Brand />
              <button
                onClick={onClose}
                className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {nav("always")}
            {footer("always")}
          </aside>
        </div>
      )}
    </>
  );
}
