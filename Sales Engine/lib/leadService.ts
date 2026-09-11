import { apiCall } from "@/lib/api";
import type { ProviderName } from "@/lib/projects";
import type {
  DiscoverResponse,
  PipelineLead,
  ProviderHealth,
  SearchFilters,
  StatsResponse,
} from "@/lib/types";

/**
 * Single frontend service for Sales Engine backend calls.
 * The browser NEVER talks to Prospeo/Hunter/Apollo directly and never sees provider
 * API keys — all provider traffic is proxied by our backend routes:
 *  - GET  /api/stats              → pipeline statistics (existing route)
 *  - GET  /api/leads              → pipeline leads (existing route)
 *  - POST /api/leads              → CSV import        (existing route)
 *  - POST /api/leads/discover     → provider search + pipeline persistence (BFF)
 *  - GET  /api/providers/health   → provider configuration status (BFF)
 */

export interface SearchLeadsParams {
  project: string;
  filters: SearchFilters;
  page?: number;
  /**
   * Optional provider override (must be one of the backend providerFactory's
   * supported providers). When omitted, the project registry decides.
   */
  provider?: ProviderName;
}

export function getStats(): Promise<StatsResponse> {
  return apiCall<StatsResponse>("/api/stats");
}

export function fetchLeads(): Promise<{ leads: PipelineLead[] }> {
  return apiCall<{ leads: PipelineLead[] }>("/api/leads");
}

export function uploadCsv(file: File): Promise<{ created: number; skipped: number }> {
  return apiCall<{ created: number; skipped: number }>("/api/leads", {
    method: "POST",
    body: file,
  });
}

export function searchLeads({ project, filters, page = 1, provider }: SearchLeadsParams): Promise<DiscoverResponse> {
  return apiCall<DiscoverResponse>("/api/leads/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, filters, page, provider }),
  });
}

export function getProviderHealth(): Promise<ProviderHealth> {
  return apiCall<ProviderHealth>("/api/providers/health");
}