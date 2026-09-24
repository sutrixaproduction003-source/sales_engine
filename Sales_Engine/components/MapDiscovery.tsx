"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { Button, Input, Select, cn } from "@/components/ui";
import { PROJECTS, getProject } from "@/lib/projects";
import { buildCategoryColors, hasCoordinates, placeCategory, type ScrapedPlace } from "@/lib/places";
import { usePlacesSearch } from "@/lib/usePlacesSearch";
import { useAutoDraft } from "@/lib/useAutoDraft";
import { getHubSpotStatus, syncToHubSpot } from "@/lib/hubspotClient";

// Leaflet touches `window` at import time, so the map is client-only.
const LeadMap = dynamic(() => import("@/components/map/LeadMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-xl border border-slate-800 bg-[#0b1120] text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

const DEFAULT_PROJECT_ID = PROJECTS[0]?.id ?? "";

const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function exportPlacesCsv(places: ScrapedPlace[]) {
  const rows = places.map((p) => ({
    Name: p.companyName,
    Category: placeCategory(p),
    "Google category": p.industry,
    Email: p.email,
    Phone: p.phone,
    Website: p.companyWebsite,
    Address: p.exactAddress,
    City: p.city ?? "",
    State: p.state ?? "",
    Country: p.country ?? "",
    Latitude: p.latitude ?? "",
    Longitude: p.longitude ?? "",
    "Google rating": p.googleRating ?? "",
    Reviews: p.totalReviewsCount ?? "",
    "Google Maps": p.googleMapsLink ?? "",
    Instagram: p.instagramLink ?? "",
    Facebook: p.facebookLink ?? "",
    LinkedIn: p.linkedinUrl,
  }));
  const url = URL.createObjectURL(new Blob([Papa.unparse(rows)], { type: "text/csv;charset=utf-8;" }));
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: `leads_${new Date().toISOString().slice(0, 10)}.csv`,
  });
  link.click();
  URL.revokeObjectURL(url);
}

function ResultRow({
  place,
  color,
  selected,
  onSelect,
  onHover,
}: {
  place: ScrapedPlace;
  color?: string;
  selected: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
}) {
  const mapped = hasCoordinates(place);
  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      disabled={!mapped}
      title={mapped ? "Show on map" : "No map location for this business"}
      className={cn(
        "w-full rounded-lg border px-3 py-2 text-left text-xs transition",
        selected
          ? "border-sky-500/50 bg-sky-500/10"
          : "border-slate-800 bg-slate-900/50 hover:border-slate-600 disabled:hover:border-slate-800"
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color ?? "#94a3b8" }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-medium text-slate-100">{place.companyName}</p>
            {typeof place.googleRating === "number" && (
              <span className="flex shrink-0 items-center gap-0.5 text-amber-300">
                <Star className="h-3 w-3 fill-current" /> {place.googleRating.toFixed(1)}
              </span>
            )}
          </div>
          <p className="truncate text-slate-500">{place.exactAddress || place.location || "Address unavailable"}</p>
          <div className="mt-1 flex items-center gap-2.5 text-slate-500">
            <span title={place.email || "No email"} className={place.email ? "text-emerald-400" : "text-slate-700"}>
              <Mail className="h-3.5 w-3.5" />
            </span>
            <span title={place.phone || "No phone"} className={place.phone ? "text-emerald-400" : "text-slate-700"}>
              <Phone className="h-3.5 w-3.5" />
            </span>
            <span title={place.companyWebsite || "No website"} className={place.companyWebsite ? "text-emerald-400" : "text-slate-700"}>
              <Globe className="h-3.5 w-3.5" />
            </span>
            <span className="ml-auto truncate text-[10px] uppercase tracking-wide">{placeCategory(place)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

/**
 * Lead discovery on the map: Location + Project → scrape Google Maps for the
 * project's business categories → businesses pinned at their exact location
 * and saved to the pipeline.
 */
export function MapDiscovery() {
  const [location, setLocation] = useState("");
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [categories, setCategories] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [filter, setFilter] = useState("");

  const { status, run, places, error, elapsed, search, cancel } = usePlacesSearch();
  const busy = status === "starting" || status === "scraping";
  const drafts = useAutoDraft();

  // Every scrape flows straight into drafting: businesses with an email get a
  // personalized draft that waits in the Review Queue (nothing is sent).
  const { draftAll, reset: resetDrafts } = drafts;
  useEffect(() => {
    if (status === "done" && run?.done && !run.saveError) {
      const ids = run.places.map((p) => p.dbId).filter((id): id is number => typeof id === "number");
      // Then, with HubSpot auto-sync on, the new leads go straight into the CRM.
      draftAll(run.places)
        .then(() => getHubSpotStatus())
        .then((hubspot) => (hubspot.connected && hubspot.autoSync && ids.length ? syncToHubSpot(ids) : null))
        .catch((error) => console.error("HubSpot sync after scrape failed:", error));
    }
    if (status === "starting") resetDrafts();
  }, [status, run, draftAll, resetDrafts]);

  const project = getProject(projectId);
  const projectCategories = project?.requirements.categories ?? [];
  const needsKeyword = projectCategories.length === 0;

  const colors = useMemo(() => buildCategoryColors(places), [places]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return places;
    return places.filter((p) =>
      `${p.companyName} ${p.exactAddress} ${p.industry} ${placeCategory(p)}`.toLowerCase().includes(q)
    );
  }, [places, filter]);

  const stats = useMemo(
    () => ({
      mapped: places.filter(hasCoordinates).length,
      withEmail: places.filter((p) => p.email).length,
      withPhone: places.filter((p) => p.phone).length,
    }),
    [places]
  );

  const canSearch = location.trim().length > 0 && (!needsKeyword || keyword.trim().length > 0) && !busy;

  const findLeads = async () => {
    if (!canSearch) return;
    setSelectedId(null);
    setFilter("");
    await search({ project: projectId, location: location.trim(), categories, keyword });
    setFitKey((k) => k + 1);
  };

  const toggleCategory = (c: string) =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  return (
    <div className="space-y-3">
      {/* Search controls */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Location</label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, area or region — e.g. Goa, India"
              className="pl-8"
              onKeyDown={(e) => e.key === "Enter" && findLeads()}
            />
          </div>
        </div>
        <div className="w-full sm:w-44">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Project</label>
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
        {needsKeyword && (
          <div className="w-full sm:w-48">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Business type
            </label>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. hotels, gyms"
              onKeyDown={(e) => e.key === "Enter" && findLeads()}
            />
          </div>
        )}
        {busy ? (
          <Button variant="secondary" onClick={cancel}>
            <X className="h-4 w-4" /> Stop waiting
          </Button>
        ) : (
          <Button onClick={findLeads} disabled={!canSearch}>
            <Search className="h-4 w-4" /> Find leads
          </Button>
        )}
      </div>

      {projectCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-slate-500">
            Searching for {categories.length ? "" : "all of"}:
          </span>
          {projectCategories.map((c) => {
            const active = categories.length === 0 || categories.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleCategory(c)}
                disabled={busy}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  active
                    ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                    : "border-slate-700 bg-slate-900 text-slate-500 hover:text-slate-300"
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      {/* Status */}
      <div className="flex min-h-[1.5rem] flex-wrap items-center gap-2 text-sm">
        {status === "idle" && (
          <span className="text-slate-400">
            Enter a location and pick a project — matching businesses are scraped from Google Maps and pinned on the map.
          </span>
        )}
        {busy && (
          <span className="flex items-center gap-2 text-sky-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            {status === "starting" ? "Starting scrape…" : "Scraping Google Maps"} · {formatElapsed(elapsed)}
            <span className="text-xs text-slate-500">(usually 1–3 minutes)</span>
          </span>
        )}
        {status === "error" && (
          <>
            <AlertTriangle className="h-4 w-4 text-rose-400" />
            <span className="text-rose-300">{error}</span>
            <Button variant="secondary" className="!px-2.5 !py-1 text-xs" onClick={findLeads}>
              Retry
            </Button>
          </>
        )}
        {status === "done" && (
          <>
            {places.length ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            )}
            <span className={places.length ? "text-emerald-300" : "text-amber-300"}>
              {places.length
                ? `${places.length} businesses found · ${stats.withEmail} with email · ${stats.withPhone} with phone`
                : "No businesses found — try a broader location."}
            </span>
            {run?.saveError ? (
              <span className="text-xs text-amber-400">{run.saveError}</span>
            ) : (
              places.length > 0 && (
                <span className="text-xs text-slate-500">
                  {run?.saved ?? 0} new saved to pipeline{run?.updated ? ` · ${run.updated} already known` : ""}
                </span>
              )
            )}
          </>
        )}
      </div>

      {(drafts.running || drafts.total > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-sm">
          {drafts.running ? (
            <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
          ) : (
            <Sparkles className="h-4 w-4 text-violet-300" />
          )}
          <span className="text-violet-200">
            {drafts.running
              ? `Drafting personalized emails · ${drafts.done}/${drafts.total}`
              : `${drafts.total - drafts.failed} email drafts ready for your review`}
            {drafts.failed > 0 && ` · ${drafts.failed} failed`}
          </span>
          {drafts.lastError && <span className="text-xs text-rose-300">{drafts.lastError}</span>}
          <Link href="/review" className="ml-auto text-sm font-medium text-sky-300 hover:underline">
            Open Review Queue →
          </Link>
        </div>
      )}

      {/* Results list + map */}
      <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex h-[360px] flex-col rounded-xl border border-slate-800 bg-slate-950/40 lg:h-[620px]">
          <div className="flex items-center gap-2 border-b border-slate-800 p-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={places.length ? `Filter ${places.length} results…` : "Results appear here"}
              disabled={!places.length}
              className="!py-1.5 text-xs"
            />
            <Button
              variant="ghost"
              className="!px-2 !py-1.5"
              onClick={() => exportPlacesCsv(places)}
              disabled={!places.length}
              title="Export results as CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
            {shown.map((place) => (
              <ResultRow
                key={place.id}
                place={place}
                color={colors.get(placeCategory(place))}
                selected={place.id === selectedId}
                onSelect={() => setSelectedId(place.id)}
                onHover={(hovering) => setHoveredId(hovering ? place.id : null)}
              />
            ))}
            {!places.length && (
              <p className="px-2 py-8 text-center text-xs text-slate-600">
                {busy ? "Waiting for results…" : "No results yet."}
              </p>
            )}
          </div>
        </div>

        <LeadMap
          places={places}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={setSelectedId}
          fitKey={fitKey}
          className="h-[480px] lg:h-[620px]"
        />
      </div>
    </div>
  );
}
