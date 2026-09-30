"use client";

import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui";
import { STATE_CONFIGS } from "@/lib/states";
import { sourceLabel } from "@/lib/format";

/**
 * Filters operate on data actually loaded from the backend: location is a
 * free-text "contains" filter and sources are derived from loaded leads.
 */
export interface LeadFilters {
  search: string;
  state: string;
  location: string;
  source: string;
}

export const EMPTY_FILTERS: LeadFilters = {
  search: "",
  state: "All",
  location: "",
  source: "All",
};

export function FilterBar({
  filters,
  onChange,
  sources,
}: {
  filters: LeadFilters;
  onChange: (f: LeadFilters) => void;
  sources: string[];
}) {
  const set = (k: keyof LeadFilters, v: string) => onChange({ ...filters, [k]: v });
  const active =
    filters.search !== "" || filters.state !== "All" || filters.location !== "" || filters.source !== "All";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <Input
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          placeholder="Search name, company, email, domain…"
          className="pl-9"
          aria-label="Search leads"
        />
      </div>
      <Select value={filters.state} onChange={(e) => set("state", e.target.value)} aria-label="State">
        <option value="All">All states</option>
        {Object.entries(STATE_CONFIGS).map(([k, c]) => (
          <option key={k} value={k}>
            {c.label}
          </option>
        ))}
      </Select>
      <Select value={filters.source} onChange={(e) => set("source", e.target.value)} aria-label="Source">
        <option value="All">All sources</option>
        {sources.map((s) => (
          <option key={s} value={s}>
            {sourceLabel(s)}
          </option>
        ))}
      </Select>
      <Input
        value={filters.location}
        onChange={(e) => set("location", e.target.value)}
        placeholder="Location…"
        className="!w-full sm:!w-40"
        aria-label="Location contains"
      />
      {active && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[13px] text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
