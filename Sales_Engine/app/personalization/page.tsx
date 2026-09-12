"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, cn } from "@/components/ui";
import { Sparkles, Wand2, PlayCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { apiCall } from "@/lib/api";
import { fetchLeads } from "@/lib/leadService";
import { PipelineLead } from "@/lib/types";

/**
 * Personalization — consumes REAL leads from the backend. Leads with status
 * SCRAPED are ready for the AI step; running the queue calls the EXISTING
 * backend route POST /api/personalize (OmniRoute). No AI provider logic or
 * keys live in the frontend.
 */
export default function PersonalizationPage() {
  const [leads, setLeads] = useState<PipelineLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchLeads()
      .then((data) => setLeads(data.leads ?? []))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load leads from the backend.")
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ready = (leads ?? []).filter((l) => l.status === "SCRAPED");
  const done = (leads ?? []).filter((l) => l.status === "PERSONALIZED");

  const runPersonalization = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await apiCall<{ personalized: number; pending: number; errors: string[] }>(
        "/api/personalize",
        { method: "POST" }
      );
      const errCount = res.errors?.length ?? 0;
      setResult({
        ok: res.personalized > 0,
        text: `Personalized ${res.personalized} of ${res.pending} queued leads${
          errCount ? ` · ${errCount} failed — first error: ${res.errors[0]}` : ""
        }.`,
      });
      load();
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "Personalization failed." });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Personalization</h1>
        <p className="text-sm text-slate-400">Generate high-signal icebreakers for scraped leads.</p>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-medium text-white">AI personalization queue</p>
            <p className="text-sm text-slate-400">
              Runs on the backend (OmniRoute) over leads with collected website context.
            </p>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-rose-300">{error}</p>
              <Button variant="secondary" className="mt-2" onClick={load}>
                Retry
              </Button>
            </div>
          </div>
        ) : leads === null ? (
          <p className="text-sm text-slate-400">Loading leads from the backend...</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-2xl font-semibold text-sky-400">{ready.length}</p>
              <p className="text-xs text-slate-400">Leads ready for personalization (scraped)</p>
              {ready.length > 0 && (
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                  {ready.map((l) => (
                    <li key={l.id} className="truncate text-xs text-slate-300">
                      {l.name || l.email} · {l.website || "N/A"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-2xl font-semibold text-emerald-400">{done.length}</p>
              <p className="text-xs text-slate-400">Personalized — awaiting review</p>
              {done.length > 0 && (
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                  {done.slice(0, 10).map((l) => (
                    <li key={l.id} className="truncate text-xs text-slate-300">
                      {l.name || l.email}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={runPersonalization} loading={running} disabled={running || ready.length === 0}>
            {running ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Running...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" /> Run Personalization Queue
              </>
            )}
          </Button>
          {result && (
            <span className={cn("flex items-center gap-1.5 text-sm", result.ok ? "text-emerald-400" : "text-rose-400")}>
              {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {result.text}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Wand2 className="h-4 w-4 text-violet-400" />
          Personalization model: configured on the backend (GROQ_API_KEY in Settings)
        </div>
      </Card>
    </div>
  );
}