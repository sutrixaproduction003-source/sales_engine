"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell } from "lucide-react";
import { cn } from "@/components/ui";

const SEARCH_TYPES = ["Leads", "Companies", "Emails", "Domains"];

export function TopBar() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("Leads");
  const [openType, setOpenType] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notifOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [notifOpen]);

  const submitSearch = () => {
    const q = search.trim();
    if (!q) return;
    router.push(`/leads?search=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`);
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-800 bg-slate-950/95 px-4 backdrop-blur">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitSearch()}
          placeholder="Search leads, companies, emails, domains..."
          className="w-full rounded-lg border border-slate-800 bg-slate-900/70 py-2 pl-8 pr-24 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <button
            onClick={() => setOpenType((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300"
          >
            {type}
            <span className="text-slate-500">⌄</span>
          </button>
          {openType && (
            <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-slate-700 bg-slate-900 shadow-lg">
              {SEARCH_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => { setType(t); setOpenType(false); }}
                  className={cn("block w-full px-3 py-1.5 text-left text-xs", t === type ? "bg-indigo-500/20 text-indigo-200" : "text-slate-300 hover:bg-slate-800")}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <button
          onClick={() => setNotifOpen((v) => !v)}
          className="relative rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-slate-300 hover:text-white"
        >
          <Bell className="h-4 w-4" />
        </button>
        {notifOpen && (
          <div ref={notifRef} className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <p className="border-b border-slate-800 px-3 py-2 text-xs font-semibold text-slate-200">Notifications</p>
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-slate-400">No new notifications.</p>
              <p className="mt-1 text-[11px] text-slate-600">
                Pipeline alerts will appear here once activity is available from the backend.
              </p>
            </div>
          </div>
        )}
      </div>

      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-xs font-semibold text-white">OP</span>
    </header>
  );
}