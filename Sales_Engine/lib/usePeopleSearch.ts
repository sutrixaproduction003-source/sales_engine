"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  pollPeopleSearch,
  startPeopleSearch,
  type PeopleSearchParams,
  type PeopleSearchResult,
} from "@/lib/people";

const POLL_INTERVAL_MS = 4000;
const MAX_WAIT_MS = 8 * 60 * 1000;

export type PeopleSearchStatus = "idle" | "searching" | "done" | "error";

/** Start a people search and poll it until both lookups have finished. */
export function usePeopleSearch() {
  const [status, setStatus] = useState<PeopleSearchStatus>("idle");
  const [result, setResult] = useState<PeopleSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    if (status !== "searching" || !startedAt) return;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [status, startedAt]);

  useEffect(() => () => void (generation.current += 1), []);

  const cancel = useCallback(() => {
    generation.current += 1;
    setStatus((s) => (s === "searching" ? "idle" : s));
  }, []);

  const search = useCallback(async (params: PeopleSearchParams) => {
    const id = ++generation.current;
    const isCurrent = () => id === generation.current;
    const began = Date.now();
    setStatus("searching");
    setResult(null);
    setError(null);
    setStartedAt(began);
    setElapsed(0);

    try {
      let current = await startPeopleSearch(params);
      while (!current.done) {
        if (Date.now() - began > MAX_WAIT_MS) throw new Error("The search is taking unusually long. Please try again.");
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (!isCurrent()) return;
        current = await pollPeopleSearch(current.jobId, params);
        if (!isCurrent()) return;
        setResult(current);
      }
      setResult(current);
      setStatus("done");
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : "People search failed.");
      setStatus("error");
    }
  }, []);

  return { status, result, error, elapsed, search, cancel };
}
