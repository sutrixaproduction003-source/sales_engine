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
  ChevronsLeft,
  UploadCloud,
  X,
} from "lucide-react";
import { cn } from "@/components/ui";

const groups: { label?: string; items: { href: string; label: string; icon: typeof Zap }[] }[] = [
  {
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

/**
 * Navigation. Phones: hidden, opened as a drawer from the top bar's menu
 * button (`open` / `onClose`). Tablets: an icon rail. Desktop: full sidebar.
 */
export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  /** `labels`: "always" in the drawer, "lg" (desktop only) in the rail. */
  const nav = (labels: "always" | "lg") => {
    const label = labels === "always" ? "inline" : "hidden lg:inline";
    return (
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-2">
        {groups.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-0.5">
            {group.label && (
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
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
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 text-sm transition",
                    labels === "always" ? "py-2.5" : "py-2",
                    active
                      ? "bg-slate-800/80 text-white"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  )}
                  title={link.label}
                >
                  <link.icon className="h-4 w-4 shrink-0" />
                  <span className={label}>{link.label}</span>
                  {active && <span className={cn("ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400", label)} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    );
  };

  const logo = (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 text-white">
      <Zap className="h-4 w-4" />
    </span>
  );

  return (
    <>
      {/* Tablet rail / desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col border-r border-slate-800 bg-slate-950 md:flex lg:w-60">
        <div className="flex h-14 items-center justify-between border-b border-slate-800 px-4">
          {logo}
          <span className="hidden text-xs font-semibold tracking-wide text-slate-300 lg:inline">Sales Engine</span>
          <span className="hidden text-slate-600 lg:inline">
            <ChevronsLeft className="h-4 w-4" />
          </span>
        </div>
        {nav("lg")}
      </aside>

      {/* Phone drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={onClose} />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex h-14 items-center gap-3 border-b border-slate-800 px-4">
              {logo}
              <span className="text-sm font-semibold text-slate-200">Sales Engine</span>
              <button onClick={onClose} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            {nav("always")}
          </aside>
        </div>
      )}
    </>
  );
}
