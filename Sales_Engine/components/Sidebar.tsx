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
  Rocket,
} from "lucide-react";
import { cn } from "@/components/ui";

const groups: { label?: string; items: { href: string; label: string; icon: typeof Zap }[] }[] = [
  {
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/leads", label: "Leads Hub", icon: Users },
      { href: "/discovery", label: "Discovery", icon: Globe },
      { href: "/apollo", label: "Apollo Search", icon: Rocket },
      { href: "/import", label: "Sales Nav Import", icon: UploadCloud },
      { href: "/dispatch", label: "Dispatch", icon: Send },
    ],
  },
  {
    label: "AI & Review",
    items: [
      { href: "/personalization", label: "Personalization", icon: Sparkles },
      { href: "/review", label: "Review Queue", icon: ClipboardCheck },
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

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="flex w-16 shrink-0 flex-col border-r border-slate-800 bg-slate-950 lg:w-60">
      <div className="flex h-14 items-center justify-between border-b border-slate-800 px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 text-white">
          <Zap className="h-4 w-4" />
        </span>
        <span className="hidden text-xs font-semibold tracking-wide text-slate-300 lg:inline">
          Sales Engine
        </span>
        <span className="hidden text-slate-600 lg:inline">
          <ChevronsLeft className="h-4 w-4" />
        </span>
      </div>
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
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                    active
                      ? "bg-slate-800/80 text-white"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  )}
                  title={link.label}
                >
                  <link.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden lg:inline">{link.label}</span>
                  {active && (
                    <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-indigo-400 lg:inline" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}