"use client";

import { useMemo, useState } from "react";
import { Button, Input, Select, cn } from "@/components/ui";
import { MapPin, RefreshCw, Search, AlertTriangle, CheckCircle2, LocateFixed, Crosshair } from "lucide-react";
import { MapView } from "@/components/MapView";
import { searchLeads } from "@/lib/leadService";
import { PROJECTS, getProject } from "@/lib/projects";
import { STATE_CONFIGS, type LeadState } from "@/lib/states";
import type { DiscoveryLead } from "@/lib/types";

/**
 * Project-agnostic map discovery — Project + Location + categories → [Find Leads].
 * Projects (and their optional target categories) come from the project
 * registry (lib/projects) — no project names are hardcoded here, so new
 * projects work without any change to this component.
 * All data comes from OUR backend (POST /api/leads/discover → provider backend
 * → Apollo → normalized → geocoded → pipeline DB). No mock results.
 */

const DEFAULT_PROJECT_ID = PROJECTS[0]?.id ?? "";

type Status = "idle" | "loading" | "success" | "empty" | "error";

export function MapDiscovery() {
  const [location, setLocation] = useState("");
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [categories, setCategories] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<DiscoveryLead[]>([]);
  const [meta, setMeta] = useState<{ saved: number; duplicates: number; geocoded: number } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const project = getProject(projectId);
  const projectCategories = project?.requirements.categories ?? [];

  const toggleCategory = (c: string) =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const findLeads = async () => {
    setStatus("loading");
    setErrorMsg(null);
    setFocusId(null);
    try {
      const data = await searchLeads({
        project: projectId,
        filters: {
          location: location.trim() || undefined,
          categories: projectCategories.length > 0 ? categories : undefined,
        },
        page: 1,
      });
      setResults(data.leads ?? []);
      setMeta({
        saved: data.saved ?? 0,
        duplicates: data.duplicates ?? 0,
        geocoded: data.geocoded ?? 0,
      });
      setStatus((data.leads ?? []).length > 0 ? "success" : "empty");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to load leads. Please try again.");
      setStatus("error");
    }
  };

  const pinsWithCoords = useMemo(
    () => results.filter((l) => typeof l.latitude === "number" && typeof l.longitude === "number"),
    [results]
  );

  const banner = (() => {
    switch (status) {
      case "idle":
        return { tone: "text-slate-400", text: "Select a project and location to discover leads." };
      case "loading":
        return { tone: "text-indigo-300", text: "Finding leads..." };
      case "success": {
        const mapped = pinsWithCoords.length;
        if (results.length > 0 && mapped === 0) {
          return {
            tone: "text-amber-300",
            text: "Leads found, but location coordinates are unavailable.",
          };
        }
        return {
          tone: "text-emerald-300",
          text: `${results.length} leads found · ${mapped}/${results.length} locations mapped · ${
            meta?.saved ?? 0
          } saved to pipeline${
            meta && meta.duplicates > 0 ? ` · ${meta.duplicates} duplicates skipped` : ""
          }${meta && meta.geocoded > 0 ? ` · ${meta.geocoded} geocoded` : ""}`,
        };
      }
      case "empty":
        return { tone: "text-amber-300", text: "No mappable locations found for the selected search." };
      case "error":
        return { tone: "text-rose-300", text: errorMsg ?? "Unable to load leads. Please try again." };
    }
  })();

  return (
    <div className="space-y-3">
      {/* Discovery controls */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-56">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Location
          </label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Search/select location"
              className="pl-8"
              onKeyDown={(e) => e.key === "Enter" && findLeads()}
            />
          </div>
        </div>
        <div className="w-full sm:w-44">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Project
          </label>
          <Select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setCategories([]);
            }}
            className="!w-full"
          >
            {PROJECTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={findLeads} loading={status === "loading"} disabled={status === "loading"}>
          {status === "loading" ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" /> Finding...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" /> Find Leads
            </>
          )}
        </Button>
      </div>

      {/* Project target categories (from the project registry — generic) */}
      {projectCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-slate-500">Target categories:</span>
          {projectCategories.map((c) => {
            const active = categories.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleCategory(c)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  active
                    ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                    : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      {/* Status banner — idle / loading / success / empty / error */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {status === "success" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
        ) : status === "error" ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
        ) : status === "empty" ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        ) : null}
        <span className={banner.tone}>{banner.text}</span>
        {status === "error" && (
          <Button variant="secondary" className="!px-2.5 !py-1 text-xs" onClick={findLeads}>
            Retry
          </Button>
        )}
      </div>

      {/* Dynamic map — markers only from real, verified coordinates */}
      <div className="h-72 overflow-hidden rounded-lg">
        <MapView
          leads={results}
          focusId={focusId}
          loading={status === "loading"}
          error={status === "error" ? errorMsg : null}
        />
      </div>

      {/* Dynamic result list */}
      {results.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-300">
              Results <span className="text-slate-500">({results.length})</span>
            </p>
            <p className="text-[11px] text-slate-500">
              {pinsWithCoords.length} of {results.length} have map coordinates
            </p>
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {results.map((lead, i) => {
              const hasCoords =
                typeof lead.latitude === "number" && typeof lead.longitude === "number";
              return (
                <div
                  key={`${lead.id}-${i}`}
                  className={cn(
                    "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs transition",
                    focusId === lead.id
                      ? "border-indigo-500/40 bg-indigo-500/10"
                      : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-100">
                      {lead.companyName || lead.fullName || "N/A"}
                    </p>
                    <p className="truncate text-slate-500">
                      {lead.fullName || "N/A"}
                      {lead.jobTitle ? ` · ${lead.jobTitle}` : ""}
                      {lead.industry ? ` · ${lead.industry}` : ""}
                    </p>
                    <p className="truncate text-slate-500">
                      {hasCoords ? (
                        lead.location || "Coordinates only"
                      ) : (
                        <span className="text-amber-400/80">Location unavailable</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">
                      Provider: {lead.source || "N/A"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                        {lead.state === "NEW"
                          ? "Discovered"
                          : (STATE_CONFIGS[lead.state as LeadState]?.label ?? lead.state ?? "NEW")}
                      </span>
                      {hasCoords ? (
                        <button
                          onClick={() => setFocusId(lead.id)}
                          title="Center map on this lead"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300 hover:border-indigo-500/40 hover:text-white"
                        >
                          <Crosshair className="h-3 w-3" /> Focus
                        </button>
                      ) : (
                        <span
                          title="No coordinates returned by the backend"
                          className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-600"
                        >
                          <LocateFixed className="h-3 w-3" /> Focus
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}