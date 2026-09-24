"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label, EmptyState, Select, cn } from "@/components/ui";
import {
  Globe,
  Play,
  SearchCheck,
  AlertTriangle,
  CheckCircle2,
  Map as MapIcon,
  Sparkles,
  Download,
} from "lucide-react";
import { PROJECTS } from "@/lib/projects";
import { SearchProviderSelector, ProviderBadge } from "@/components/SearchProviderSelector";
import { DiscoveryResultCard } from "@/components/discovery/DiscoveryResultCard";
import { Pagination } from "@/components/discovery/Pagination";
import { QuickStatsCard } from "@/components/discovery/QuickStatsCard";
import type { SearchProvider } from "@/lib/searchProviders";
import type { DiscoveryLead } from "@/lib/types";
import { exportLeadsCsv, toDiscoveryLead, withReviewRatings } from "@/lib/discoveryLeads";
import { useStats } from "@/lib/useStats";

const LEADS_PER_PAGE = 8;

/** Providers whose search results can be enriched (DuckDuckGo is OSINT only). */
const ENRICHABLE_PROVIDERS: SearchProvider[] = ["apollo", "hunter", "prospeo"];

const BRAND_TYPES = ["Independent", "Chain", "Resort", "Spa", "Service Apartment"];
const PROPERTY_SIZES = ["Small", "Medium", "Large"];

interface DiscoveryResult {
  /** Provider that produced these leads; enrichment goes to the same one. */
  provider: SearchProvider;
  leads: DiscoveryLead[];
  saved: number;
  total: number;
}

interface EnrichResponse {
  success?: boolean;
  error?: string;
  data?: { lead?: Partial<DiscoveryLead>; saved?: boolean };
  lead?: Partial<DiscoveryLead>;
}

/** Stable key for a lead within the full result list (not the current page). */
const leadKeyOf = (lead: DiscoveryLead, index: number) => String(lead.id || index);

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
      <div className="flex items-center gap-2 text-sm text-rose-300">
        <AlertTriangle className="h-4 w-4" />
        {message}
      </div>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/**
 * Discovery — runs REAL lead discovery through the existing provider backend.
 *
 * Flow: provider search → show leads → optional per-lead enrichment
 * (POST /api/leads/enrich, forwarded to the backend provider service) → save.
 */
export default function DiscoveryPage() {
  const [projectId, setProjectId] = useState(PROJECTS[0]?.id ?? "");
  const [searchProvider, setSearchProvider] = useState<SearchProvider>("apollo");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [jobTitles, setJobTitles] = useState("");
  const [hotelName, setHotelName] = useState("");
  const [brandType, setBrandType] = useState("");
  const [propertySizeCategory, setPropertySizeCategory] = useState("");

  const [running, setRunning] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const { stats, error: statsError, reload: reloadStats } = useStats();

  const startDiscovery = async () => {
    setRunning(true);
    setError(null);
    setEnrichError(null);
    setResult(null);
    setCurrentPage(1);

    const provider = searchProvider;
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          filters: {
            location: location.trim() || undefined,
            industry: industry.trim() || undefined,
            jobTitle: jobTitles.trim() || undefined,
            keywords: [brandType, propertySizeCategory].filter(Boolean).join(", ") || undefined,
            company: hotelName.trim() || undefined,
            hotelName: hotelName.trim() || undefined,
            brandType: brandType || undefined,
            propertySizeCategory: propertySizeCategory || undefined,
          },
          page: 1,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Search failed with status ${response.status}`);
      }

      const items: Record<string, unknown>[] = data.data?.items ?? [];
      const leads = await withReviewRatings(
        items.map((item) => toDiscoveryLead(item, { hotelName, brandType, propertySizeCategory }))
      );

      setResult({ provider, leads, saved: data.saved ?? 0, total: leads.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  /**
   * Enrich one discovered lead. Kept separate from discovery because search
   * returns limited contact information and enrichment is a separate
   * (credit-consuming) provider operation.
   */
  const enrichLead = async (lead: DiscoveryLead, leadKey: string) => {
    if (!result) return;

    setEnrichingId(leadKey);
    setEnrichError(null);

    try {
      const response = await fetch("/api/leads/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: projectId, provider: result.provider, lead }),
      });

      const data = (await response.json().catch(() => {
        throw new Error("The enrichment service returned an invalid response.");
      })) as EnrichResponse;

      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || `Lead enrichment failed with HTTP ${response.status}.`);
      }

      const enrichedLead = data?.data?.lead || data?.lead;
      if (!enrichedLead) {
        throw new Error("Enrichment completed but no lead data was returned.");
      }

      setResult((current) =>
        current && {
          ...current,
          leads: current.leads.map((currentLead, index) =>
            leadKeyOf(currentLead, index) === leadKey ? { ...currentLead, ...enrichedLead } : currentLead
          ),
          saved: data?.data?.saved === true ? current.saved + 1 : current.saved,
        }
      );

      await reloadStats();
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : "Lead enrichment failed. Please try again.");
    } finally {
      setEnrichingId(null);
    }
  };

  const canEnrich = result ? ENRICHABLE_PROVIDERS.includes(result.provider) : false;
  const pageStart = (currentPage - 1) * LEADS_PER_PAGE;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Discovery</h1>
        <p className="text-sm text-slate-400">Find, enrich, and import new leads through provider integrations.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-4 lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
              <Globe className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">New Discovery Run</h2>
              <p className="text-xs text-slate-400">
                Discover leads first, then enrich selected leads when contact details are required.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Project</Label>
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="!w-full">
                {PROJECTS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="sm:col-span-2">
              <SearchProviderSelector
                selectedProvider={searchProvider}
                onProviderChange={setSearchProvider}
                showDescription={true}
                layout="dropdown"
              />
            </div>

            <div>
              <Label>Industry</Label>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Hospitality" />
            </div>

            <div>
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Goa, India" />
            </div>

            <div>
              <Label>Hotel Name</Label>
              <Input value={hotelName} onChange={(e) => setHotelName(e.target.value)} placeholder="e.g. Taj Exotica" />
            </div>

            <div>
              <Label>Brand Type</Label>
              <Select value={brandType} onChange={(e) => setBrandType(e.target.value)} className="!w-full">
                <option value="">Any brand type</option>
                {BRAND_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Property Size Category</Label>
              <Select
                value={propertySizeCategory}
                onChange={(e) => setPropertySizeCategory(e.target.value)}
                className="!w-full"
              >
                <option value="">Any property size</option>
                {PROPERTY_SIZES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Label>Job Titles</Label>
              <Input
                value={jobTitles}
                onChange={(e) => setJobTitles(e.target.value)}
                placeholder="e.g. General Manager, Owner"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2">
              <SearchCheck className="h-4 w-4 text-indigo-400" />
              <span className="text-sm text-slate-300">
                <span className="font-medium text-indigo-300">
                  <ProviderBadge provider={searchProvider} />
                </span>{" "}
                {searchProvider === "duckduckgo"
                  ? "OSINT search engine (free, no API key required)"
                  : "via the provider backend"}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              {searchProvider === "duckduckgo" ? "Public search results" : "Keys secured on backend"}
            </span>
          </div>

          <Button onClick={startDiscovery} loading={running} disabled={running} className="w-full">
            {running ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Running Discovery...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start Discovery
              </>
            )}
          </Button>

          {error && <ErrorBanner message={error} onRetry={startDiscovery} />}
          {enrichError && <ErrorBanner message={enrichError} />}

          {result && (
            <div
              className={cn(
                "rounded-lg border p-4",
                result.total > 0 ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {result.total > 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-emerald-300">
                      {result.total} leads found · {result.saved} saved to the pipeline
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span className="text-amber-300">No leads found for the selected criteria.</span>
                  </>
                )}
              </div>

              {result.total > 0 && (
                <div className="mt-4 space-y-3">
                  {canEnrich && (
                    <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3">
                      <div className="flex items-start gap-2">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                        <div>
                          <p className="text-xs font-medium text-indigo-300">Lead enrichment available</p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            Search provides limited contact information. Use <strong>Enrich & Save</strong> to
                            retrieve available contact details for an individual lead.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {result.leads.slice(pageStart, pageStart + LEADS_PER_PAGE).map((lead, offset) => {
                    const leadKey = leadKeyOf(lead, pageStart + offset);
                    return (
                      <DiscoveryResultCard
                        key={leadKey}
                        lead={lead}
                        canEnrich={canEnrich}
                        isEnriching={enrichingId === leadKey}
                        enrichDisabled={enrichingId !== null || running}
                        onEnrich={() => enrichLead(lead, leadKey)}
                      />
                    );
                  })}

                  <Pagination
                    page={currentPage}
                    pageSize={LEADS_PER_PAGE}
                    total={result.leads.length}
                    onPageChange={setCurrentPage}
                  >
                    <Button variant="ghost" onClick={() => exportLeadsCsv(result.leads)}>
                      <Download className="h-4 w-4" />
                      Export CSV
                    </Button>
                  </Pagination>
                </div>
              )}
            </div>
          )}

          <div className="flex items-start gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-3">
            <MapIcon className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
            <p className="text-xs text-slate-400">
              Per-project category targeting is configured in the project registry and is also available on the{" "}
              <Link href="/" className="font-medium text-sky-400 hover:underline">
                Overview map discovery
              </Link>
              .
            </p>
          </div>
        </Card>

        <QuickStatsCard stats={stats} error={statsError} onRetry={reloadStats} />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Discovery History</h3>
        </div>
        <EmptyState
          icon={<Globe className="h-6 w-6" />}
          title="No discovery runs recorded yet"
          description="Run history will appear here once the backend persists discovery runs. Results found above are already saved in the Leads Hub."
        />
      </Card>
    </div>
  );
}
