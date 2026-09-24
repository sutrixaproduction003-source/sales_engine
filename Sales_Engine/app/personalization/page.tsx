"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, cn } from "@/components/ui";
import { Sparkles, Wand2, PlayCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { apiCall } from "@/lib/api";
import { fetchLeads } from "@/lib/leadService";
import { PipelineLead } from "@/lib/types";

/**
 * Personalization — drafts personalized emails for leads that have an email
 * but no draft yet (POST /api/personalize, in batches). Drafts go to the
 * Review Queue; nothing is sent from here.
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

  const ready = (leads ?? []).filter((l) => l.email && (l.status === "PENDING" || l.status === "SCRAPED"));
  const done = (leads ?? []).filter((l) => l.status === "PERSONALIZED");

  const runPersonalization = async () => {
    setRunning(true);
    setResult(null);
    try {
      let drafted = 0;
      let attempted = 0;
      const errors: string[] = [];
      // The route drafts a small batch per call; keep going until the queue is empty.
      for (;;) {
        const res = await apiCall<{ personalized: number; pending: number; remaining: number; errors: string[] }>(
          "/api/personalize",
          { method: "POST" }
        );
        drafted += res.personalized;
        attempted += res.pending;
        errors.push(...(res.errors ?? []));
        if (res.remaining === 0 || res.pending === 0 || res.personalized === 0) break;
      }
      setResult({
        ok: drafted > 0,
        text: `Drafted ${drafted} of ${attempted} emails — review them in the Review Queue${
          errors.length ? ` · ${errors.length} failed — first error: ${errors[0]}` : ""
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
        <p className="text-sm text-slate-400">Draft a personalized email for every lead with an email address.</p>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-medium text-white">Email drafting queue</p>
            <p className="text-sm text-slate-400">
              Reads each lead&apos;s website and drafts an email. New map leads are drafted automatically.
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
              <p className="text-xs text-slate-400">Leads with an email and no draft yet</p>
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
              <p className="text-xs text-slate-400">Drafted — waiting in the Review Queue</p>
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
                <PlayCircle className="h-4 w-4" /> Draft emails
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
          Uses DeepSeek or Groq when a key is set in Settings, otherwise a template with your sender pitch.
        </div>
      </Card>
    </div>
  );
}