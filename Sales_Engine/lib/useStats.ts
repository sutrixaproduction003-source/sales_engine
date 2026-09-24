"use client";

import { useCallback, useEffect, useState } from "react";
import { getStats } from "@/lib/leadService";
import type { StatsResponse } from "@/lib/types";

/** Pipeline counters from GET /api/stats, loaded on mount. */
export function useStats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setStats(await getStats());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipeline statistics.");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { stats, error, reload };
}
