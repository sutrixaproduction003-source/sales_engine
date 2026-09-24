"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card, cn } from "@/components/ui";
import { UploadCloud } from "lucide-react";
import { refreshLeads, useLeadsStore } from "@/lib/leadStore";
import { uploadCsv } from "@/lib/leadService";
import { StateBadge } from "@/components/StateBadge";
import { LeadDrawer } from "@/components/LeadDrawer";
import { FilterBar, LeadFilters, EMPTY_FILTERS } from "./filters";
import { PipelineLead } from "@/lib/types";

/**
 * Leads Hub — fully dynamic. Leads are loaded from the backend
 * (GET /api/leads → leads spreadsheet); CSV import goes through
 * POST /api/leads (server-side parsing + dedup). No hardcoded rows.
 */
export function LeadsHub() {
  const { leads, loading, error } = useLeadsStore();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS);
  const [drawerLead, setDrawerLead] = useState<PipelineLead | null>(null);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshLeads();
  }, []);

  // TopBar search → /leads?search=... seeds the text filter.
  const search = searchParams.get("search") ?? "";
  useEffect(() => {
    if (search) setFilters((f) => ({ ...f, search }));
  }, [search]);

  // Map popup "View Lead" → /leads?lead=<id> opens the drawer for that lead.
  const leadParam = searchParams.get("lead");
  useEffect(() => {
    if (!leadParam) return;
    const found = leads.find((l) => String(l.id) === leadParam);
    if (found) setDrawerLead(found);
  }, [leadParam, leads]);

  const sources = useMemo(
    () => Array.from(new Set(leads.map((l) => l.source).filter((s): s is string => !!s))),
    [leads]
  );

  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase().trim();
    return leads.filter((l) => {
      if (q && !`${l.name} ${l.company ?? ""} ${l.email ?? ""} ${l.website}`.toLowerCase().includes(q)) return false;
      if (filters.state !== "All" && l.status !== filters.state) return false;
      if (filters.location && !(l.location ?? "").toLowerCase().includes(filters.location.toLowerCase())) return false;
      if (filters.source !== "All" && (l.source ?? "") !== filters.source) return false;
      return true;
    });
  }, [leads, filters]);

  const onUpload = (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    uploadCsv(file)
      .then((res) => {
        setUploadMsg({
          ok: true,
          text: `Imported ${res.created} leads${res.skipped ? ` · ${res.skipped} duplicates skipped by the backend` : ""}.`,
        });
        return refreshLeads();
      })
      .catch((err: unknown) =>
        setUploadMsg({ ok: false, text: err instanceof Error ? err.message : "Upload failed." })
      )
      .finally(() => setUploading(false));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-white">Leads Hub</h1>
          <p className="text-sm text-slate-400">
            {leads.length} total leads &middot; {filtered.length} shown
          </p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Link
            href="/import"
            className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-200 hover:bg-sky-500/20"
          >
            <UploadCloud className="h-4 w-4" /> Import from Sales Navigator
          </Link>
          <Button variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
            <UploadCloud className="h-4 w-4" /> Import CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onUpload(e.target.files?.[0])}
          />
        </div>
      </div>

      {uploadMsg && (
        <p className={cn("text-sm", uploadMsg.ok ? "text-emerald-400" : "text-rose-400")}>{uploadMsg.text}</p>
      )}

      <Card className="!p-3">
        <FilterBar filters={filters} onChange={setFilters} sources={sources} />
      </Card>

      <Card className="overflow-x-auto !p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
              <th className="px-3 py-3">Name</th>
              <th className="hidden px-3 py-3 md:table-cell">Job Title</th>
              <th className="px-3 py-3">Company</th>
              <th className="hidden px-3 py-3 lg:table-cell">Website</th>
              <th className="hidden px-3 py-3 xl:table-cell">Email</th>
              <th className="hidden px-3 py-3 lg:table-cell">Source</th>
              <th className="px-3 py-3">Lead Score</th>
              <th className="hidden px-3 py-3 lg:table-cell">Data Quality</th>
              <th className="px-3 py-3">State</th>
              <th className="hidden px-3 py-3 xl:table-cell">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="px-3 py-12 text-center text-sm text-slate-400">
                  Loading leads...
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={10} className="px-3 py-12 text-center">
                  <p className="text-sm text-rose-400">{error}</p>
                  <Button variant="secondary" className="mt-3" onClick={() => refreshLeads()}>
                    Retry
                  </Button>
                </td>
              </tr>
            )}
            {!loading && !error && filtered.map((lead) => (
              <tr
                key={lead.id}
                className="cursor-pointer border-b border-slate-800/60 transition last:border-0 hover:bg-slate-900/50"
                onClick={() => setDrawerLead(lead)}
              >
                <td className="px-3 py-2.5">
                  <span className="font-medium text-slate-100">{lead.name}</span>
                </td>
                <td className="hidden px-3 py-2.5 text-slate-300 md:table-cell">{lead.jobTitle || "N/A"}</td>
                <td className="px-3 py-2.5 text-slate-300">{lead.company || "N/A"}</td>
                <td className="hidden max-w-[200px] truncate px-3 py-2.5 text-slate-400 lg:table-cell">
                  {lead.website || "N/A"}
                </td>
                <td className="hidden px-3 py-2.5 text-slate-400 xl:table-cell">{lead.email}</td>
                <td className="hidden px-3 py-2.5 lg:table-cell">
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                    {lead.source || "N/A"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-500">N/A</td>
                <td className="hidden px-3 py-2.5 text-xs text-slate-500 lg:table-cell">N/A</td>
                <td className="px-3 py-2.5">
                  <StateBadge state={lead.status} size="sm" />
                </td>
                <td className="hidden px-3 py-2.5 text-xs text-slate-500 xl:table-cell">
                  {lead.updatedAt ? new Date(lead.updatedAt).toLocaleString() : "N/A"}
                </td>
              </tr>
            ))}
            {!loading && !error && filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-12 text-center text-sm text-slate-500">
                  {leads.length === 0
                    ? "No leads yet — import a CSV or discover leads from the Overview map."
                    : "No leads match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <LeadDrawer lead={drawerLead} onClose={() => setDrawerLead(null)} />
    </div>
  );
}