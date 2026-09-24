"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pollPlacesSearch, startPlacesSearch, type PlacesRun, type StartPlacesSearchParams } from "@/lib/places";

const POLL_INTERVAL_MS = 4000;
/** Give up waiting after this long; the Apify run keeps going server-side. */
const MAX_WAIT_MS = 10 * 60 * 1000;

export type PlacesSearchStatus = "idle" | "starting" | "scraping" | "done" | "error";

/**
 * Start a Google Maps scrape and poll it until it finishes. Only one search
 * runs at a time; starting a new one (or cancelling) stops the previous poll.
 */
export function usePlacesSearch() {
  const [status, setStatus] = useState<PlacesSearchStatus>("idle");
  const [run, setRun] = useState<PlacesRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const generation = useRef(0);

  // Elapsed-time ticker while a search is active.
  useEffect(() => {
    if (!startedAt || (status !== "starting" && status !== "scraping")) return;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startedAt, status]);

  useEffect(() => () => void (generation.current += 1), []);

  const cancel = useCallback(() => {
    generation.current += 1;
    setStatus((current) => (current === "starting" || current === "scraping" ? "idle" : current));
  }, []);

  const search = useCallback(async (params: StartPlacesSearchParams) => {
    const id = ++generation.current;
    const isCurrent = () => id === generation.current;
    const began = Date.now();

    setStatus("starting");
    setError(null);
    setRun(null);
    setStartedAt(began);
    setElapsed(0);

    try {
      let current = await startPlacesSearch(params);
      if (!isCurrent()) return;
      setStatus("scraping");
      setRun(current);

      while (!current.done) {
        if (Date.now() - began > MAX_WAIT_MS) {
          throw new Error("The scrape is taking unusually long. Try a smaller area or fewer categories.");
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (!isCurrent()) return;
        current = await pollPlacesSearch(current.runId, params.project);
        if (!isCurrent()) return;
        setRun(current);
      }

      setStatus("done");
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : "Lead search failed. Please try again.");
      setStatus("error");
    }
  }, []);

  return { status, run, places: run?.places ?? [], error, elapsed, search, cancel };
}
