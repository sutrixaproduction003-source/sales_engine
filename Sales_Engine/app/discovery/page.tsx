"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  Input,
  Label,
  EmptyState,
  Select,
  cn,
} from "@/components/ui";
import {
  Globe,
  Play,
  SearchCheck,
  AlertTriangle,
  CheckCircle2,
  Map as MapIcon,
  Sparkles,
  Mail,
  Phone,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { getStats } from "@/lib/leadService";
import {
  PROJECTS,
  type ProviderName,
} from "@/lib/projects";
import { SearchProviderSelector, ProviderBadge } from "@/components/SearchProviderSelector";
import type { SearchProvider } from "@/lib/searchProviders";
import { DiscoveryLead, StatsResponse } from "@/lib/types";
import Papa from "papaparse";

/**
 * Discovery — runs REAL lead discovery through the existing provider backend.
 *
 * Flow:
 * Discovery → provider search → show leads → Apollo enrichment → save enriched lead
 *
 * Apollo search results intentionally contain limited contact information.
 * The Enrich & Save action calls the frontend BFF:
 *
 * POST /api/leads/enrich
 *
 * which forwards the request to the backend provider service.
 */
export default function DiscoveryPage() {
  const [projectId, setProjectId] = useState(PROJECTS[0]?.id ?? "");
  const [provider] = useState<ProviderName | "" | SearchProvider>("apollo");
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

  const [result, setResult] = useState<{
    leads: DiscoveryLead[];
    saved: number;
    total: number;
  } | null>(null);

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const leadsPerPage = 8;

  const loadStats = useCallback(async () => {
    setStatsError(null);

    try {
      setStats(await getStats());
    } catch (err) {
      setStatsError(
        err instanceof Error
          ? err.message
          : "Failed to load pipeline statistics."
      );
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const startDiscovery = async () => {
    setRunning(true);
    setError(null);
    setEnrichError(null);
    setResult(null);
    setCurrentPage(1);

    try {
      // Use unified search API for all providers
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: searchProvider,
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

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Search failed with status ${response.status}`);
      }

      const data = await response.json();

      const mappedLeads: DiscoveryLead[] = data.data?.items?.map((item: Record<string, unknown>) => ({
        id: item.id,
        firstName: item.firstName,
        lastName: item.lastName,
        fullName: item.fullName || item.name,
        email: item.email,
        phone: item.phone,
        jobTitle: item.jobTitle,
        companyName: item.companyName || item.company,
        hotelName: item.hotelName || hotelName || item.companyName || item.company,
        brandType: item.brandType || brandType,
        propertySizeCategory: item.propertySizeCategory || propertySizeCategory,
        companyWebsite: item.website || item.companyWebsite,
        location: item.location,
        city: item.city,
        state: item.state,
        exactAddress: item.exactAddress,
        googleMapsLink: item.googleMapsLink,
        googleBusinessLink: item.googleBusinessLink,
        tripAdvisorLink: item.tripAdvisorLink,
        bookingComLink: item.bookingComLink,
        makeMyTripLink: item.makeMyTripLink,
        instagramLink: item.instagramLink,
        facebookLink: item.facebookLink,
        googleRating: item.googleRating,
        totalReviewsCount: item.totalReviewsCount,
        sentimentScore: item.sentimentScore,
        linkedinUrl: item.linkedinUrl,
        industry: item.industry,
        source: item.source,
        category: item.category,
        subCategory: item.subCategory,
        classificationConfidence: item.classificationConfidence,
        classificationReason: item.classificationReason,
        linkedinAvailable: item.linkedinAvailable,
        linkedinSource: item.linkedinSource,
        linkedinCompanyUrl: item.linkedinCompanyUrl,
      })) ?? [];

      const reviewLeads = await Promise.all(
        mappedLeads.map(async (lead, idx) => {
          // Only do the review lookup for the first 8 leads (to keep requests bounded).
          if (idx >= 8) return lead;

          if (!lead.companyName) return lead;
          try {
            const reviewResponse = await fetch("/api/search/reviews", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ company: lead.companyName, location: lead.location }),
            });
            const review = await reviewResponse.json();
            return {
              ...lead,
              googleRating: review.rating ?? lead.googleRating,
              totalReviewsCount: review.reviewCount ?? lead.totalReviewsCount,
              googleBusinessLink: review.link || lead.googleBusinessLink,
            };
          } catch {
            return lead;
          }
        })
      );
      const enrichedLeads = reviewLeads;

      setResult({
        leads: enrichedLeads,
        saved: data.saved ?? 0,
        total: enrichedLeads.length,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Discovery failed. Please try again."
      );
    } finally {
      setRunning(false);
    }
  };

  // Export all leads to Excel
  const exportToExcel = () => {
    if (!result || result.leads.length === 0) return;

    const exportData = result.leads.map((lead) => ({
      "Full Name": lead.fullName,
      "First Name": lead.firstName,
      "Last Name": lead.lastName,
      "Email": lead.email,
      "Phone": lead.phone,
      "Job Title": lead.jobTitle,
      "Company": lead.companyName,
      "Hotel Name": lead.hotelName,
      "Brand Type": lead.brandType,
      "Property Size": lead.propertySizeCategory,
      "Website": lead.companyWebsite,
      "Location": lead.location,
      "City": lead.city,
      "State": lead.state,
      "Exact Address": lead.exactAddress,
      "Google Maps": lead.googleMapsLink,
      "Google Business": lead.googleBusinessLink,
      "TripAdvisor": lead.tripAdvisorLink,
      "Booking.com": lead.bookingComLink,
      "MakeMyTrip": lead.makeMyTripLink,
      "Instagram": lead.instagramLink,
      "Facebook": lead.facebookLink,
      "LinkedIn": lead.linkedinUrl,
      "Industry": lead.industry,
      "Source": lead.source,
      "Category": lead.category,
      "Sub-Category": lead.subCategory,
      "Classification Confidence": lead.classificationConfidence ? Math.round(lead.classificationConfidence * 100) + "%" : "",
      "Google Rating": lead.googleRating ?? "",
      "Total Reviews": lead.totalReviewsCount ?? "",
      "Sentiment Score": lead.sentimentScore ?? "",
      "Google Maps Link": lead.googleMapsLink,
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `discovery_leads_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /**
   * Enrich one discovered lead.
   *
   * This is intentionally handled separately from discovery because
   * Apollo search returns limited contact information and enrichment
   * is a separate provider operation.
   */
  const enrichLead = async (lead: DiscoveryLead, index: number) => {
    const leadKey = String(lead.id || index);

    setEnrichingId(leadKey);
    setEnrichError(null);

    try {
      const response = await fetch("/api/leads/enrich", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project: projectId,
          provider: provider || "apollo",
          lead: lead,
        }),
      });

      let data: {
        success?: boolean;
        error?: string;
        data?: { lead?: Partial<DiscoveryLead>; saved?: boolean };
        lead?: Partial<DiscoveryLead>;
      } | null = null;

      try {
        data = await response.json();
      } catch {
        throw new Error("The enrichment service returned an invalid response.");
      }

      if (!response.ok || data?.success === false) {
        throw new Error(
          data?.error ||
          `Lead enrichment failed with HTTP ${response.status}.`
        );
      }

      const enrichedLead =
        data?.data?.lead ||
        data?.lead ||
        null;

      if (!enrichedLead) {
        throw new Error("Enrichment completed but no lead data was returned.");
      }

      setResult((current) => {
        if (!current) {
          return current;
        }

        const updatedLeads = current.leads.map((currentLead, currentIndex) => {
          const currentKey = String(currentLead.id || currentIndex);

          if (currentKey !== leadKey) {
            return currentLead;
          }

          return {
            ...currentLead,
            ...enrichedLead,
          };
        });

        return {
          ...current,
          leads: updatedLeads,
          saved:
            data?.data?.saved === true
              ? current.saved + 1
              : current.saved,
        };
      });

      await loadStats();
    } catch (err) {
      setEnrichError(
        err instanceof Error
          ? err.message
          : "Lead enrichment failed. Please try again."
      );
    } finally {
      setEnrichingId(null);
    }
  };

  /**
   * Enrichment is available for Apollo, Hunter, and Prospeo
   * DuckDuckGo results are OSINT and don't have verified contact details
   */
  const canEnrich = ["apollo", "hunter", "prospeo"].includes(searchProvider.toLowerCase());

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Discovery</h1>
        <p className="text-sm text-slate-400">
          Find, enrich, and import new leads through provider integrations.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-4 lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
              <Globe className="h-5 w-5" />
            </span>

            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                New Discovery Run
              </h2>

              <p className="text-xs text-slate-400">
                Discover leads first, then enrich selected leads when contact
                details are required.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Project</Label>

              <Select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="!w-full"
              >
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

              <Input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Hospitality"
              />
            </div>

            <div>
              <Label>Location</Label>

              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Goa, India"
              />
            </div>

            <div>
              <Label>Hotel Name</Label>
              <Input
                value={hotelName}
                onChange={(e) => setHotelName(e.target.value)}
                placeholder="e.g. Taj Exotica"
              />
            </div>

            <div>
              <Label>Brand Type</Label>
              <Select
                value={brandType}
                onChange={(e) => setBrandType(e.target.value)}
                className="!w-full"
              >
                <option value="">Any brand type</option>
                <option value="Independent">Independent</option>
                <option value="Chain">Chain</option>
                <option value="Resort">Resort</option>
                <option value="Spa">Spa</option>
                <option value="Service Apartment">Service Apartment</option>
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
                <option value="Small">Small</option>
                <option value="Medium">Medium</option>
                <option value="Large">Large</option>
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
              {searchProvider === "duckduckgo"
                ? "Public search results"
                : "Keys secured on backend"}
            </span>
          </div>

          <Button
            onClick={startDiscovery}
            loading={running}
            disabled={running}
            className="w-full"
          >
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

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
              <div className="flex items-center gap-2 text-sm text-rose-300">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>

              <Button
                variant="secondary"
                className="mt-3"
                onClick={startDiscovery}
              >
                Retry
              </Button>
            </div>
          )}

          {enrichError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
              <div className="flex items-center gap-2 text-sm text-rose-300">
                <AlertTriangle className="h-4 w-4" />
                {enrichError}
              </div>
            </div>
          )}

          {result && (
            <div
              className={cn(
                "rounded-lg border p-4",
                result.total > 0
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-amber-500/30 bg-amber-500/10"
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {result.total > 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />

                    <span className="text-emerald-300">
                      {result.total} leads found · {result.saved} saved to the
                      pipeline
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-400" />

                    <span className="text-amber-300">
                      No leads found for the selected criteria.
                    </span>
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
                          <p className="text-xs font-medium text-indigo-300">
                            Lead enrichment available
                          </p>

                          <p className="mt-1 text-[11px] text-slate-400">
                            Search provides limited contact information.
                            Use <strong>Enrich & Save</strong> to retrieve
                            available contact details for an individual lead.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {result.leads.slice((currentPage - 1) * leadsPerPage, currentPage * leadsPerPage).map((lead, index) => {
                    const leadKey = String(lead.id || index);
                    const isEnriching = enrichingId === leadKey;

                    return (
                      <div
                        key={leadKey}
                        className="rounded-lg border border-slate-800 bg-slate-900/60 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">
                              {lead.fullName ||
                                `${lead.firstName || ""} ${lead.lastName || ""
                                  }`.trim() ||
                                "Unknown person"}
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                              {lead.jobTitle || "Job title unavailable"}
                              {lead.companyName
                                ? ` · ${lead.companyName}`
                                : ""}
                            </p>

                            {lead.location && (
                              <p className="mt-1 text-xs text-slate-500">
                                {lead.location}
                              </p>
                            )}

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              {typeof lead.googleRating === "number" ? (
                                <span className="text-amber-300">
                                  Google {lead.googleRating.toFixed(1)}/5
                                  {typeof lead.totalReviewsCount === "number"
                                    ? ` · ${lead.totalReviewsCount.toLocaleString()} reviews`
                                    : ""}
                                </span>
                              ) : lead.googleMapsLink ? (
                                <a
                                  href={lead.googleMapsLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sky-300 hover:text-sky-200"
                                >
                                  Check Google rating
                                </a>
                              ) : null}
                            </div>

                            {/* Lead classification */}
                            {(lead.category ||
                              lead.subCategory ||
                              typeof lead.classificationConfidence === "number") && (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  {lead.category && (
                                    <span className="rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-300">
                                      {lead.category === "channel_partner"
                                        ? "Channel Partner"
                                        : lead.category === "direct_customer"
                                          ? "Direct Customer"
                                          : lead.category}
                                    </span>
                                  )}

                                  {lead.subCategory && (
                                    <span className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-300">
                                      {lead.subCategory
                                        .split("_")
                                        .map(
                                          (word) =>
                                            word.charAt(0).toUpperCase() +
                                            word.slice(1)
                                        )
                                        .join(" ")}
                                    </span>
                                  )}

                                  {typeof lead.classificationConfidence === "number" && (
                                    <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300">
                                      Classification:{" "}
                                      {Math.round(
                                        lead.classificationConfidence * 100
                                      )}
                                      %
                                    </span>
                                  )}
                                </div>
                              )}

                            <div className="mt-2 space-y-1">
                              {lead.email && (
                                <div className="flex items-center gap-2 text-xs text-slate-300">
                                  <Mail className="h-3.5 w-3.5 text-sky-400" />
                                  <span className="truncate">
                                    {lead.email}
                                  </span>
                                </div>
                              )}

                              {lead.phone && (
                                <div className="flex items-center gap-2 text-xs text-slate-300">
                                  <Phone className="h-3.5 w-3.5 text-emerald-400" />
                                  <span>{lead.phone}</span>
                                </div>
                              )}

                              {!lead.email && !lead.phone && (
                                <p className="text-[11px] text-slate-500">
                                  Contact information not available from
                                  discovery.
                                </p>
                              )}
                            </div>
                          </div>

                          {canEnrich && (
                            <div className="shrink-0">
                              {lead.email || lead.phone ? (
                                <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Enriched
                                </div>
                              ) : (
                                <Button
                                  variant="secondary"
                                  onClick={() => enrichLead(lead, index)}
                                  loading={isEnriching}
                                  disabled={
                                    enrichingId !== null || running
                                  }
                                  className="whitespace-nowrap"
                                >
                                  {isEnriching ? (
                                    <>
                                      <Sparkles className="h-4 w-4" />
                                      Enriching...
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="h-4 w-4" />
                                      Enrich & Save
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {result.leads.length > 0 && (
                    <div className="flex items-center justify-between pt-4">
                      <p className="text-[11px] text-slate-500">
                        Showing {(currentPage - 1) * leadsPerPage + 1} to{" "}
                        {Math.min(currentPage * leadsPerPage, result.leads.length)} of{" "}
                        {result.leads.length} leads
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-slate-400">
                          Page {currentPage} of {Math.ceil(result.leads.length / leadsPerPage)}
                        </span>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setCurrentPage((p) =>
                              Math.min(Math.ceil(result.leads.length / leadsPerPage), p + 1)
                            )
                          }
                          disabled={currentPage >= Math.ceil(result.leads.length / leadsPerPage)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={exportToExcel}
                        >
                          <Download className="h-4 w-4" />
                          Export Excel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-start gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-3">
            <MapIcon className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />

            <p className="text-xs text-slate-400">
              Per-project category targeting is configured in the project
              registry and is also available on the{" "}
              <Link
                href="/"
                className="font-medium text-sky-400 hover:underline"
              >
                Overview map discovery
              </Link>
              .
            </p>
          </div>
        </Card>

        {/* Quick stats — real pipeline counters from GET /api/stats */}
        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">
            Quick Stats
          </h3>

          {statsError ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {statsError}

              <Button
                variant="secondary"
                className="mt-2 w-full !py-1 text-xs"
                onClick={loadStats}
              >
                Retry
              </Button>
            </div>
          ) : stats === null ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
              Loading pipeline statistics...
            </div>
          ) : (
            <div className="space-y-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <p className="text-2xl font-semibold text-white">
                  {stats.total}
                </p>

                <p className="text-xs text-slate-400">
                  Leads in pipeline
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <p className="text-2xl font-semibold text-sky-400">
                  {stats.scraped}
                </p>

                <p className="text-xs text-slate-400">
                  Scraped (context collected)
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <p className="text-2xl font-semibold text-emerald-400">
                  {stats.personalized}
                </p>

                <p className="text-xs text-slate-400">
                  Personalized
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Discovery history */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">
            Discovery History
          </h3>
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