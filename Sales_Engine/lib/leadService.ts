import { apiCall } from "@/lib/api";
import type {
  PipelineLead,
  ProviderHealth,
  StatsResponse,
} from "@/lib/types";

/**
 * Single frontend service for Sales Engine backend calls.
 * The browser NEVER talks to Apollo directly and never sees provider
 * API keys — all provider traffic is proxied by our backend routes:
 *  - GET  /api/stats              → pipeline statistics (existing route)
 *  - GET  /api/leads              → pipeline leads (existing route)
 *  - POST /api/leads              → CSV import        (existing route)
 *  - GET  /api/providers/health   → provider configuration status (BFF)
 */

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

export function getProviderHealth(): Promise<ProviderHealth> {
  return apiCall<ProviderHealth>("/api/providers/health");
}