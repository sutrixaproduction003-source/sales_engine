"use client";

import { useCallback, useRef, useState } from "react";
import type { ScrapedPlace } from "@/lib/places";

export interface AutoDraftState {
  running: boolean;
  total: number;
  done: number;
  failed: number;
  lastError: string | null;
}

const IDLE: AutoDraftState = { running: false, total: 0, done: 0, failed: 0, lastError: null };

/**
 * Draft outreach emails for freshly scraped leads, one lead per request (so
 * no request runs long). Drafts land in the Review Queue — nothing is sent.
 */
export function useAutoDraft() {
  const [state, setState] = useState<AutoDraftState>(IDLE);
  const generation = useRef(0);

  const draftAll = useCallback(async (places: ScrapedPlace[]) => {
    const queue = places.filter(
      (p) => p.dbId != null && p.email && (p.status === "PENDING" || p.status === "SCRAPED")
    );
    const id = ++generation.current;
    setState({ ...IDLE, running: queue.length > 0, total: queue.length });

    for (const place of queue) {
      if (id !== generation.current) return;
      try {
        const response = await fetch(`/api/leads/${place.dbId}/draft`, { method: "POST" });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(body.error || `Drafting failed (${response.status}).`);
        setState((s) => ({ ...s, done: s.done + 1 }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setState((s) => ({ ...s, done: s.done + 1, failed: s.failed + 1, lastError: message }));
      }
    }
    if (id === generation.current) setState((s) => ({ ...s, running: false }));
  }, []);

  const reset = useCallback(() => {
    generation.current += 1;
    setState(IDLE);
  }, []);

  return { ...state, draftAll, reset };
}
