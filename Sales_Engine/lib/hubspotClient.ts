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
  for (;;) {
    const res = await apiCall<{ synced: number; failed: number; errors: string[]; attempted: number; remaining: number }>(
      "/api/hubspot/sync",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }
    );
    synced += res.synced;
    failed += res.failed;
    errors.push(...res.errors);
    onProgress?.(synced + failed, res.remaining);
    // Stop when done, or when a whole batch failed (retrying would loop forever).
    if (res.remaining === 0 || res.attempted === 0 || res.synced === 0) break;
  }
  return { synced, failed, errors };
}
