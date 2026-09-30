"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Search } from "lucide-react";

/** Top bar: phone menu button and a lead search (press "/" to focus). */
export function TopBar({ onMenu }: { onMenu?: () => void }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const submitSearch = () => {
    const q = search.trim();
    if (!q) return;
    router.push(`/leads?search=${encodeURIComponent(q)}`);
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-slate-800/80 bg-slate-950/85 px-3 backdrop-blur-md sm:gap-3 sm:px-6">
      {onMenu && (
        <button
          onClick={onMenu}
          className="rounded-lg p-2 text-slate-300 ring-1 ring-inset ring-slate-800 hover:bg-slate-900 hover:text-white md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}
      <div className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          ref={input}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitSearch()}
          placeholder="Search leads, companies, emails…"
          aria-label="Search leads"
          className="w-full rounded-lg border border-slate-800 bg-slate-900/70 py-2 pl-9 pr-10 text-sm text-slate-100 placeholder:text-slate-500 transition-colors hover:border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-slate-700 bg-slate-800 px-1.5 text-[11px] font-medium text-slate-400 sm:block">
          /
        </kbd>
      </div>
    </header>
  );
}
