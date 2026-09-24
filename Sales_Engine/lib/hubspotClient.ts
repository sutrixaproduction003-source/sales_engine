"use client";

import { apiCall } from "@/lib/api";

export interface HubSpotStatus {
  configured: boolean;
  connected: boolean;
  autoSync: boolean;
  error?: string;
}

export const getHubSpotStatus = () => apiCall<HubSpotStatus>("/api/hubspot/health");

/**
 * Sync leads to HubSpot in batches (the route handles a batch per call).
 * Pass no ids to sync every new or changed lead.
 */
export async function syncToHubSpot(
  ids?: number[],
  onProgress?: (done: number, remaining: number) => void
): Promise<{ synced: number; failed: number; errors: string[] }> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  // Leads that failed in this run are skipped by later batches, so one bad
  // batch doesn't stop the rest from syncing (and nothing is retried forever).
  const skip: number[] = [];
  for (;;) {
    const res = await apiCall<{
      synced: number;
      failed: number;
      errors: string[];
      failedIds?: number[];
      attempted: number;
      remaining: number;
    }>("/api/hubspot/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, skip }),
    });
    synced += res.synced;
    failed += res.failed;
    errors.push(...res.errors);
    skip.push(...(res.failedIds ?? []));
    onProgress?.(synced + failed, res.remaining);
    if (res.remaining === 0 || res.attempted === 0) break;
    // Every lead attempted but none recorded as failed or synced: stop rather than loop.
    if (res.synced === 0 && !res.failedIds?.length) break;
  }
  return { synced, failed, errors };
}
