"use client";

import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui";
import { STATE_CONFIGS } from "@/lib/states";

/**
 * Filters operate on data actually loaded from the backend. The former
 * hardcoded INDUSTRIES / LOCATIONS option lists are gone — location is a
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative mr-auto w-full md:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
        <input
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          placeholder="Search name, company, email, domain..."
          className="w-full rounded-lg border border-slate-700 bg-slate-900/80 py-2 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <Select value={filters.state} onChange={(e) => set("state", e.target.value)} className="!w-auto">
        <option value="All">State: All</option>
        {Object.entries(STATE_CONFIGS).map(([k, c]) => (
          <option key={k} value={k}>
            {c.label}
          </option>
        ))}
      </Select>
      <Input
        value={filters.location}
        onChange={(e) => set("location", e.target.value)}
        placeholder="Location contains..."
        className="!w-44"
      />
      <Select value={filters.source} onChange={(e) => set("source", e.target.value)} className="!w-auto">
        <option value="All">Source: All</option>
        {sources.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
    </div>
  );
}