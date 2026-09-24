import { useSyncExternalStore } from "react";
import { fetchLeads } from "@/lib/leadService";
import type { PipelineLead } from "@/lib/types";

type Listener = () => void;

export interface LeadsStoreState {
  leads: PipelineLead[];
  loading: boolean;
  error: string | null;
}

/**
 * API-backed lead store (replaces the former mock store).
 * Data comes from the backend (GET /api/leads → leads spreadsheet);
 * UI components consume it through useLeadsStore()/refreshLeads().
 */
let state: LeadsStoreState = { leads: [], loading: false, error: null };
const listeners = new Set<Listener>();
let inFlight: Promise<void> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<LeadsStoreState>) {
  state = { ...state, ...patch };
  emit();
}

export function refreshLeads(): Promise<void> {
  if (inFlight) return inFlight;
  setState({ loading: true, error: null });
  inFlight = fetchLeads()
    .then((data) => {
      setState({ leads: data.leads ?? [], loading: false, error: null });
    })
    .catch((err: unknown) => {
      setState({
        error: err instanceof Error ? err.message : "Failed to load leads",
        loading: false,
      });
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const snapshot = () => state;
const serverSnapshot: LeadsStoreState = { leads: [], loading: false, error: null };

/** React hook that re-renders when the shared lead store changes. */
export function useLeadsStore(): LeadsStoreState {
  return useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
}