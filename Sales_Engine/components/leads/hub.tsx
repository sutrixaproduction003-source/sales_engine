"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card, EmptyState, PageHeader, cn } from "@/components/ui";
import { FileUp, Mail, Phone, UploadCloud, Users } from "lucide-react";
import { domainOf, initials, sourceLabel, timeAgo } from "@/lib/format";
import { refreshLeads, useLeadsStore } from "@/lib/leadStore";
import { uploadCsv } from "@/lib/leadService";
import { StateBadge } from "@/components/StateBadge";
import { LeadDrawer } from "@/components/LeadDrawer";
import { FilterBar, LeadFilters, EMPTY_FILTERS } from "./filters";
import { PipelineLead } from "@/lib/types";
import { LeadActions } from "./LeadActions";

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

  const th = "sticky top-0 z-10 bg-slate-900 px-3 py-2.5 text-left text-xs font-medium text-slate-400";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leads Hub"
        description={
          <>
            <span className="tabular text-slate-300">{leads.length.toLocaleString()}</span> leads
            {filtered.length !== leads.length && (
              <>
                {" "}· <span className="tabular text-slate-300">{filtered.length.toLocaleString()}</span> shown
              </>
            )}
          </>
        }
        actions={
          <>
            <Link
              href="/import"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm ring-1 ring-inset ring-white/10 hover:bg-indigo-500"
            >
              <UploadCloud className="h-4 w-4" /> Import from Sales Navigator
            </Link>
            <Button variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4" /> Import CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => onUpload(e.target.files?.[0])}
            />
          </>
        }
      />

      {uploadMsg && (
        <p className={cn("text-sm", uploadMsg.ok ? "text-emerald-300" : "text-rose-300")}>{uploadMsg.text}</p>
      )}

      <Card className="overflow-hidden !p-0">
        <div className="space-y-3 border-b border-slate-800 p-3 sm:p-4">
          <FilterBar filters={filters} onChange={setFilters} sources={sources} />
          <LeadActions leads={filtered} />
        </div>

        <div className="min-h-[240px] overflow-auto lg:max-h-[calc(100vh-17rem)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className={th}>Person</th>
                <th className={th}>Company</th>
                <th className={cn(th, "hidden lg:table-cell")}>Contact</th>
                <th className={cn(th, "hidden md:table-cell")}>Source</th>
                <th className={th}>State</th>
                <th className={cn(th, "hidden xl:table-cell")}>Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-3 py-3">
                      <div className="h-8 animate-pulse rounded-md bg-slate-800/50" />
                    </td>
                  </tr>
                ))}
              {!loading && error && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center">
                    <p className="text-sm text-rose-300">{error}</p>
                    <Button variant="secondary" className="mt-3" onClick={() => refreshLeads()}>
                      Retry
                    </Button>
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                filtered.map((lead) => {
                  const domain = domainOf(lead.website);
                  return (
                    <tr
                      key={lead.id}
                      className="cursor-pointer transition-colors hover:bg-slate-850"
                      onClick={() => setDrawerLead(lead)}
                    >
                      <td className="max-w-[16rem] px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-slate-300">
                            {initials(lead.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-100">{lead.name}</p>
                            <p className="truncate text-xs text-slate-500">{lead.jobTitle || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[14rem] px-3 py-2.5">
                        <p className="truncate text-slate-200">{lead.company || "—"}</p>
                        {domain && <p className="truncate text-xs text-slate-500">{domain}</p>}
                      </td>
                      <td className="hidden max-w-[16rem] px-3 py-2.5 lg:table-cell">
                        <p className={cn("flex items-center gap-1.5 truncate text-xs", lead.email ? "text-slate-300" : "text-slate-600")}>
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{lead.email || "No email"}</span>
                        </p>
                        <p className={cn("mt-0.5 flex items-center gap-1.5 truncate text-xs", lead.phone ? "text-slate-300" : "text-slate-600")}>
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{lead.phone || (lead.phoneStatus === "pending" ? "Mobile coming…" : "No phone")}</span>
                        </p>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs text-slate-400 md:table-cell">
                        {sourceLabel(lead.source)}
                      </td>
                      <td className="px-3 py-2.5">
                        <StateBadge state={lead.status} size="sm" />
                      </td>
                      <td className="tabular hidden whitespace-nowrap px-3 py-2.5 text-xs text-slate-500 xl:table-cell">
                        {timeAgo(lead.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {!loading && !error && filtered.length === 0 && (
            <div className="p-6">
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title={leads.length === 0 ? "No leads yet" : "No leads match your filters"}
                description={
                  leads.length === 0
                    ? "Find businesses on the Overview map, import a Sales Navigator list, or upload a CSV."
                    : "Try clearing a filter or searching for something else."
                }
              />
            </div>
          )}
        </div>
      </Card>

      <LeadDrawer lead={drawerLead} onClose={() => setDrawerLead(null)} />
    </div>
  );
}
